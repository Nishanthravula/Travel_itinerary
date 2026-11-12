import type { DayWeather, GeoPoint, ItineraryStop, Place, TransportMode } from '../types'
import { haversineKm, hhmmToMinutes } from '../types'
import { isBadWeather } from '../api/weather'
import { centroidOf, orderByRoute } from './cluster'
import type { PlanStyle } from './styles'
import { hopMinutes } from './transport'

/** Time (minutes) a traveller needs after landing before sightseeing:
 *  immigration, luggage, transfer, hotel drop-off. */
export const ARRIVAL_BUFFER_MIN = 150
/** Time (minutes) to stop sightseeing before a departing flight:
 *  hotel pickup, transfer, check-in, security. */
export const DEPARTURE_BUFFER_MIN = 210

// Clock anchors, minutes since local midnight.
const LUNCH_EARLIEST = hhmmToMinutes('12:00')
const LUNCH_DUE = hhmmToMinutes('12:15')
const LUNCH_LATEST_SIGHT_END = hhmmToMinutes('13:45')
const LUNCH_TOO_LATE = hhmmToMinutes('15:00')
const CAFE_FROM = hhmmToMinutes('15:15')
const CAFE_UNTIL = hhmmToMinutes('17:30')
const EXTRA_FROM = hhmmToMinutes('17:15')
const DINNER_EARLIEST = hhmmToMinutes('18:30')
const DINNER_DUE = hhmmToMinutes('19:00')
const DINNER_LATEST_SIGHT_END = hhmmToMinutes('20:00')
/** Nothing is scheduled to end after this unless a flight says earlier. */
const HARD_END = hhmmToMinutes('23:30')

const CAFE_MIN = 45
const EXTRA_MIN = 45
const SUNSET_MIN = 45
/** A walking leg longer than this gets a "consider transit" note. */
const LONG_WALK_MIN = 30

export interface DayInputs {
  sights: Place[]
  restaurants: Place[]
  cafes: Place[]
  /** Markets, bakeries and bars for the food style's extra stop. */
  markets?: Place[]
  weather?: DayWeather
  /** Minutes since local midnight the day becomes usable (arrival day). */
  notBefore?: number
  /** Minutes since local midnight the day must end (departure day). */
  notAfter?: number
  /** Restaurant/cafe ids already used earlier in the trip. */
  usedIds: Set<string>
  cityCenter: GeoPoint
  style: PlanStyle
  transport: TransportMode
}

export interface ScheduledDay {
  stops: ItineraryStop[]
  notes: string[]
}

const roundUp5 = (min: number) => Math.ceil(min / 5) * 5

/**
 * Build one day as a continuous timeline.
 *
 * Stops are laid end to end with the estimated travel time between them, so
 * a day never holds more than physically fits for the chosen transport.
 * Lunch, a café and dinner are slotted in when the clock reaches them.
 *
 * - Sights are routed nearest-neighbour to minimise backtracking.
 * - On rainy days indoor sights come first and a note is added.
 * - Food picks are the strongest options closest to where the traveller
 *   will be at that hour, never repeated across the trip.
 * - A viewpoint is held for golden hour when the evening is clear.
 */
export function scheduleDay(inputs: DayInputs): ScheduledDay {
  const { weather, usedIds, style, transport } = inputs
  const notes: string[] = []

  const dayStart = hhmmToMinutes(style.dayStart)
  const hardEnd = Math.min(inputs.notAfter ?? HARD_END, HARD_END)
  /** Sights end by here; meals start by here. */
  const softEnd = Math.min(hhmmToMinutes(style.dayEnd), hardEnd)
  let t = roundUp5(Math.max(inputs.notBefore ?? dayStart, dayStart))

  const rainy = weather ? isBadWeather(weather) : false
  if (rainy) {
    notes.push(
      `Rain likely (${weather!.precipProbability}% chance) — indoor sights are scheduled first; pack a rain layer.`,
    )
  }
  if (t >= softEnd) return { stops: [], notes }

  // Order today's sights: indoor-first in rain, otherwise a short route.
  let queue = [...inputs.sights]
  let sunsetPick: Place | undefined
  if (rainy) {
    queue.sort((a, b) => Number(b.indoor) - Number(a.indoor) || b.score - a.score)
  } else {
    const vpIdx = queue.findIndex((s) => s.kind === 'viewpoint')
    if (vpIdx >= 0) sunsetPick = queue.splice(vpIdx, 1)[0]
    queue = orderByRoute(queue, centroidOf(queue) ?? inputs.cityCenter)
    if (sunsetPick) queue.push(sunsetPick) // held back; pulled forward at golden hour
  }

  const sunsetMin = hhmmToMinutes(weather?.sunset ?? '19:15')
  const inGoldenHour = (at: number) => at >= sunsetMin - 75 && at <= sunsetMin + 15

  const stops: ItineraryStop[] = []
  let lastPos: GeoPoint | null = null
  let sightsDone = 0
  let sightsOpen = true
  let lunch = false
  let cafe = false
  let extra = !(style.extraFoodStop && inputs.markets && inputs.markets.length > 0)
  let dinner = false

  /** Append a stop if it fits; returns whether it was added. */
  const add = (
    place: Place,
    durationMin: number,
    note: string | undefined,
    opts: { earliest?: number; mustEndBy: number; mustStartBy: number },
  ): boolean => {
    const travel = lastPos ? hopMinutes(lastPos, place, transport) : undefined
    const startMin = roundUp5(Math.max(t + (travel ?? 0), opts.earliest ?? 0))
    if (startMin > opts.mustStartBy || startMin + durationMin > opts.mustEndBy) return false
    if (travel !== undefined && transport === 'walk' && travel > LONG_WALK_MIN && lastPos) {
      const from = stops[stops.length - 1]?.place.name ?? 'the previous stop'
      notes.push(
        `Long walk between ${from} and ${place.name} (≈ ${travel} min) — consider transit for this leg.`,
      )
    }
    stops.push({ place, startMin, durationMin, note, travelFromPrevMin: travel })
    t = startMin + durationMin
    lastPos = place
    return true
  }

  const nextSight = (): { place: Place; duration: number; golden: boolean } | null => {
    if (!sightsOpen || sightsDone >= style.sightsPerDay || queue.length === 0) return null
    if (sunsetPick && queue.includes(sunsetPick) && inGoldenHour(t)) {
      return { place: sunsetPick, duration: SUNSET_MIN, golden: true }
    }
    return { place: queue[0], duration: style.sightStayMin, golden: false }
  }

  const foodAnchor = (): GeoPoint => lastPos ?? centroidOf(queue) ?? inputs.cityCenter

  // Each pass either adds a stop, retires a slot, or jumps the clock forward.
  for (let guard = 0; guard < 40 && !dinner; guard++) {
    const sight = nextSight()
    const sightEnd = sight
      ? t + (lastPos ? hopMinutes(lastPos, sight.place, transport) : 0) + sight.duration
      : Infinity

    if (!lunch && t >= LUNCH_TOO_LATE) {
      lunch = true // arrived too late for lunch
      continue
    }
    if (!lunch && (t >= LUNCH_DUE || sightEnd > LUNCH_LATEST_SIGHT_END)) {
      lunch = true
      const pick = pickNearest(inputs.restaurants, foodAnchor(), usedIds)
      if (pick && add(pick, style.mealMin, mealNote(pick), {
        earliest: LUNCH_EARLIEST, mustStartBy: softEnd, mustEndBy: hardEnd,
      })) usedIds.add(pick.id)
      continue
    }
    if (!dinner && (t >= DINNER_DUE || sightEnd > DINNER_LATEST_SIGHT_END || sightEnd > softEnd)) {
      // One last small stop before dinner for the food style.
      if (!extra && t >= EXTRA_FROM) {
        extra = true
        const pick = pickNearest(inputs.markets ?? [], foodAnchor(), usedIds)
        if (pick && add(pick, EXTRA_MIN, 'Local favourite — a market, bakery or bar worth a stop', {
          mustStartBy: softEnd, mustEndBy: hardEnd,
        })) usedIds.add(pick.id)
        continue
      }
      dinner = true
      const pick = pickNearest(inputs.restaurants, foodAnchor(), usedIds)
      if (pick && add(pick, style.mealMin, mealNote(pick), {
        earliest: DINNER_EARLIEST, mustStartBy: softEnd, mustEndBy: hardEnd,
      })) usedIds.add(pick.id)
      continue
    }
    if (!cafe && t >= CAFE_FROM) {
      cafe = true
      if (t < CAFE_UNTIL) {
        const pick = pickNearest(inputs.cafes, foodAnchor(), usedIds)
        if (pick && add(pick, CAFE_MIN, 'Local café — recharge before the evening', {
          mustStartBy: softEnd, mustEndBy: hardEnd,
        })) usedIds.add(pick.id)
      }
      continue
    }
    if (sight) {
      const note = sight.golden
        ? `Golden hour — sunset around ${weather?.sunset ?? '19:15'}`
        : noteForSight(sight.place, rainy)
      if (add(sight.place, sight.duration, note, { mustStartBy: softEnd, mustEndBy: softEnd })) {
        queue.splice(queue.indexOf(sight.place), 1)
        sightsDone++
      } else {
        sightsOpen = false // out of daylight for sights; meals may still fit
      }
      continue
    }
    // No sight to place: move the clock to the next thing that is due.
    const next = !lunch ? LUNCH_DUE : !cafe ? CAFE_FROM : DINNER_DUE
    if (next <= t) break
    t = next
  }

  return { stops, notes }
}

function pickNearest(
  candidates: Place[],
  from: GeoPoint,
  usedIds: Set<string>,
): Place | undefined {
  // Candidates arrive pre-sorted by score; among the strongest options,
  // take the one closest to the traveller's current position.
  const shortlist = candidates.filter((c) => !usedIds.has(c.id)).slice(0, 12)
  if (shortlist.length === 0) return undefined
  return shortlist.reduce((best, c) =>
    haversineKm(c, from) < haversineKm(best, from) ? c : best,
  )
}

function mealNote(pick: Place): string {
  return pick.cuisine
    ? `${capitalize(pick.cuisine)} cuisine — a well-regarded local spot`
    : 'Well-regarded local spot'
}

function noteForSight(place: Place, rainy: boolean): string | undefined {
  if (rainy && place.indoor) return 'Indoor — a good rainy-hours pick'
  switch (place.kind) {
    case 'museum':
      return 'Allow extra time if there are special exhibits'
    case 'viewpoint':
      return 'Best light in the morning or golden hour'
    case 'park':
    case 'national_park':
      return 'Mornings are quieter and cooler'
    default:
      return place.wikipedia ? 'A signature sight of the city' : undefined
  }
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

import type { DayWeather, ItineraryStop, Place } from '../types'
import { hhmmToMinutes } from '../types'
import { isBadWeather } from '../api/weather'
import { centroidOf, orderByRoute } from './cluster'
import { haversineKm, type GeoPoint } from '../types'

/** Time (minutes) a traveller needs after landing before sightseeing:
 *  immigration, luggage, transfer, hotel drop-off. */
export const ARRIVAL_BUFFER_MIN = 150
/** Time (minutes) to stop sightseeing before a departing flight:
 *  hotel pickup, transfer, check-in, security. */
export const DEPARTURE_BUFFER_MIN = 210

const DAY_START = hhmmToMinutes('09:00')
const DAY_END = hhmmToMinutes('21:30')

interface SlotTemplate {
  startMin: number
  durationMin: number
  role: 'sight' | 'lunch' | 'cafe' | 'sight-late' | 'sunset' | 'dinner'
}

const FULL_DAY_TEMPLATE: SlotTemplate[] = [
  { startMin: hhmmToMinutes('09:00'), durationMin: 105, role: 'sight' },
  { startMin: hhmmToMinutes('11:00'), durationMin: 90, role: 'sight' },
  { startMin: hhmmToMinutes('12:45'), durationMin: 75, role: 'lunch' },
  { startMin: hhmmToMinutes('14:15'), durationMin: 95, role: 'sight' },
  { startMin: hhmmToMinutes('16:00'), durationMin: 45, role: 'cafe' },
  { startMin: hhmmToMinutes('17:00'), durationMin: 90, role: 'sight-late' },
  { startMin: hhmmToMinutes('19:00'), durationMin: 45, role: 'sunset' },
  { startMin: hhmmToMinutes('19:45'), durationMin: 90, role: 'dinner' },
]

export interface DayInputs {
  sights: Place[]
  restaurants: Place[]
  cafes: Place[]
  weather?: DayWeather
  /** Minutes since local midnight the day becomes usable (arrival day). */
  notBefore?: number
  /** Minutes since local midnight the day must end (departure day). */
  notAfter?: number
  /** Restaurant/cafe ids already used earlier in the trip. */
  usedIds: Set<string>
  cityCenter: GeoPoint
}

export interface ScheduledDay {
  stops: ItineraryStop[]
  notes: string[]
}

/**
 * Fill one day's slot template with concrete places.
 *
 * - Sights are routed nearest-neighbour to minimise backtracking.
 * - On rainy days indoor sights are scheduled first and a note is added.
 * - Lunch/dinner/café picks are the top-rated options closest to where
 *   the traveller will actually be at that hour.
 * - Viewpoints get the sunset slot when the evening is clear.
 */
export function scheduleDay(inputs: DayInputs): ScheduledDay {
  const { weather, usedIds } = inputs
  const notes: string[] = []
  const windowStart = Math.max(inputs.notBefore ?? DAY_START, DAY_START)
  const windowEnd = Math.min(inputs.notAfter ?? DAY_END, DAY_END)

  const slots = FULL_DAY_TEMPLATE.filter(
    (s) => s.startMin >= windowStart && s.startMin + s.durationMin <= windowEnd,
  )

  const rainy = weather ? isBadWeather(weather) : false
  if (rainy) {
    notes.push(
      `Rain likely (${weather!.precipProbability}% chance) — indoor sights are scheduled first; pack a rain layer.`,
    )
  }

  // Choose today's sights, indoor-first when the forecast is poor.
  let sights = [...inputs.sights]
  if (rainy) {
    sights.sort((a, b) => Number(b.indoor) - Number(a.indoor) || b.score - a.score)
  }

  // Sunset slot: reserve the best viewpoint for golden hour on clear evenings.
  let sunsetPick: Place | undefined
  if (!rainy) {
    const vpIdx = sights.findIndex((s) => s.kind === 'viewpoint')
    if (vpIdx >= 0) sunsetPick = sights.splice(vpIdx, 1)[0]
  }

  const anchor = centroidOf(sights) ?? inputs.cityCenter
  sights = rainy ? sights : orderByRoute(sights, anchor)

  const stops: ItineraryStop[] = []
  let sightCursor = 0
  let lastPos: GeoPoint = inputs.cityCenter

  const sunsetMin = weather ? hhmmToMinutes(weather.sunset) : hhmmToMinutes('19:15')

  for (const slot of slots) {
    switch (slot.role) {
      case 'sight':
      case 'sight-late': {
        const place = sights[sightCursor++]
        if (!place) break
        stops.push({
          place,
          startMin: slot.startMin,
          durationMin: slot.durationMin,
          note: noteForSight(place, rainy),
        })
        lastPos = place
        break
      }
      case 'lunch':
      case 'dinner': {
        const pick = pickNearest(inputs.restaurants, lastPos, usedIds)
        if (!pick) break
        usedIds.add(pick.id)
        stops.push({
          place: pick,
          startMin: slot.startMin,
          durationMin: slot.durationMin,
          note: pick.cuisine
            ? `${capitalize(pick.cuisine)} cuisine — a well-regarded local spot`
            : 'Well-regarded local spot',
        })
        break
      }
      case 'cafe': {
        const pick = pickNearest(inputs.cafes, lastPos, usedIds)
        if (!pick) break
        usedIds.add(pick.id)
        stops.push({
          place: pick,
          startMin: slot.startMin,
          durationMin: slot.durationMin,
          note: 'Local café — recharge before the evening',
        })
        break
      }
      case 'sunset': {
        if (!sunsetPick) break
        const start = Math.max(slot.startMin, sunsetMin - 45)
        if (start + slot.durationMin > windowEnd) break
        stops.push({
          place: sunsetPick,
          startMin: start,
          durationMin: slot.durationMin,
          note: `Golden hour — sunset around ${weather?.sunset ?? '19:15'}`,
        })
        break
      }
    }
  }

  stops.sort((a, b) => a.startMin - b.startMin)
  return { stops, notes }
}

function pickNearest(
  candidates: Place[],
  from: GeoPoint,
  usedIds: Set<string>,
): Place | undefined {
  // Candidates arrive pre-sorted by score; among the strongest options,
  // take the one closest to the traveller's current position.
  const fresh = candidates.filter((c) => !usedIds.has(c.id))
  const shortlist = fresh.slice(0, 12)
  if (shortlist.length === 0) return undefined
  return shortlist.reduce((best, c) =>
    haversineKm(c, from) < haversineKm(best, from) ? c : best,
  )
}

function noteForSight(place: Place, rainy: boolean): string | undefined {
  if (rainy && place.indoor) return 'Indoor — a good rainy-hours pick'
  switch (place.kind) {
    case 'museum':
      return 'Allow extra time if there are special exhibits'
    case 'viewpoint':
      return 'Best light in the morning or golden hour'
    case 'park':
      return 'Mornings are quieter and cooler'
    default:
      return place.wikipedia ? 'A signature sight of the city' : undefined
  }
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

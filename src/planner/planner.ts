import type {
  CityInfo,
  DayWeather,
  Destination,
  GeoPoint,
  ItineraryDay,
  ItineraryStop,
  Place,
  PlacePool,
  PlanOption,
  Trip,
  TripRequest,
} from '../types'
import { addDaysISO, haversineKm, hhmmToMinutes, localISODate } from '../types'
import { FORECAST_HORIZON_DAYS, isBadWeather } from '../api/weather'
import { centroidOf, clusterPlaces } from './cluster'
import { ARRIVAL_BUFFER_MIN, DEPARTURE_BUFFER_MIN, scheduleDay } from './schedule'
import { rankStays } from './stays'
import { STYLES, STYLE_ORDER, type PlanStyle } from './styles'
import { TRANSPORT } from './transport'

export interface PlannerInputs {
  request: TripRequest
  destination: Destination
  pool: PlacePool
  weatherByDate: Map<string, DayWeather>
  cityInfo: CityInfo
}

/** Two options sharing more than this share of sights are near-duplicates. */
const MAX_OVERLAP = 0.8
/** A notable sight this close to a plan's base names its neighbourhood. */
const BASE_LABEL_KM = 1
const FOOD_KINDS = new Set(['restaurant', 'cafe', 'market'])

const isSightStop = (s: ItineraryStop) => !FOOD_KINDS.has(s.place.kind)

/**
 * Build every plan option for a trip from one fetched pool of places.
 *
 * Options are built in a fixed order (highlights → food → easy). An option
 * is dropped when it would be a near-duplicate of one already kept or has
 * too few sights to fill the days — small towns get fewer, honest options
 * rather than three copies of the same plan.
 */
export function buildTrip(inputs: PlannerInputs): Trip {
  const { request, destination, pool, cityInfo } = inputs
  const days = clampDays(request.days)
  const normalized: TripRequest = { ...request, days }
  const runInputs = { ...inputs, request: normalized }

  const usedFood = new Set<string>()
  const options: PlanOption[] = []
  for (const id of STYLE_ORDER) {
    const option = buildOption(runInputs, STYLES[id], usedFood)
    if (options.length > 0) {
      const tooThin = option.summary.sightCount < days
      const duplicate = options.some((kept) => optionOverlap(kept, option) > MAX_OVERLAP)
      if (tooThin || duplicate) continue
    }
    options.push(option)
  }

  const todayLocal = localISODate()
  const lastForecastable = addDaysISO(todayLocal, FORECAST_HORIZON_DAYS - 1)
  const lastDate = addDaysISO(request.startDate, days - 1)

  return {
    id: tripId(destination, normalized),
    createdAt: new Date().toISOString(),
    request: normalized,
    destination,
    cityInfo,
    options,
    parks: [...pool.nationalParks.slice(0, 6), ...pool.parks.slice(0, 3)],
    forecastPartial: lastDate > lastForecastable,
    notice: noticeFor(options, destination.name, normalized, pool.missing ?? []),
  }
}

/**
 * Stable id for a request: planning the same trip again replaces the saved
 * copy instead of piling up duplicates.
 */
export function tripId(destination: Destination, r: TripRequest): string {
  const f = r.flights
  return [
    destination.lat.toFixed(3),
    destination.lon.toFixed(3),
    r.startDate,
    r.endDate,
    r.travellers,
    r.transport,
    f.arrivalTime ?? '',
    f.departureTime ?? '',
  ].join('|')
}

function noticeFor(
  options: PlanOption[],
  city: string,
  r: TripRequest,
  missing: NonNullable<PlacePool['missing']>,
): string | undefined {
  const parts: string[] = []

  if (options.length < STYLE_ORDER.length) {
    const hasFlights = Boolean(r.flights.arrivalTime || r.flights.departureTime)
    parts.push(
      hasFlights && options[0]?.summary.sightCount === 0
        ? 'Your flight times leave no time for sightseeing on this trip, so there is a single plan.'
        : `Only ${options.length} distinct plan${options.length === 1 ? '' : 's'} — there isn't enough mapped data around ${city} for more.`,
    )
  }

  // The places service is shared and sometimes drops part of an answer.
  const lost: string[] = []
  if (missing.includes('food')) lost.push('Restaurants and cafés could not be loaded, so there are no meal stops.')
  if (missing.includes('stays')) lost.push('Places to stay could not be loaded.')
  if (missing.includes('parks')) lost.push('Parks could not be loaded.')
  if (lost.length > 0) parts.push(`${lost.join(' ')} Plan again in a few minutes to fill them in.`)

  return parts.length > 0 ? parts.join(' ') : undefined
}

/**
 * Build one plan option:
 *
 * 1. Rank candidate sights by notability plus the style's own weighting.
 * 2. Cluster them geographically — one tight cluster per day.
 * 3. Match clusters to dates so outdoor-heavy days get the best weather.
 * 4. Trim the first/last day around flights.
 * 5. Lay out each day as a timeline with travel time between stops.
 *
 * `avoidFoodIds` holds food picks of options built earlier; they are
 * avoided while the pool has enough alternatives, and this option's own
 * picks are added to it.
 */
export function buildOption(
  inputs: PlannerInputs,
  style: PlanStyle,
  avoidFoodIds: Set<string>,
): PlanOption {
  const { request, destination, pool, weatherByDate } = inputs
  const days = clampDays(request.days)
  const profile = TRANSPORT[request.transport]

  // --- 1. Candidates.
  const nature = profile.includeNature
    ? pool.nationalParks
        .filter((p) => haversineKm(p, destination) <= profile.radiusKm)
        .slice(0, Math.ceil(days / 3))
    : []
  const weighted = (p: Place) => p.score + style.sightWeight(p)
  const budget = Math.max(days * style.sightsPerDay - nature.length, days)
  const candidates: Place[] = [
    ...[...pool.sights, ...pool.parks.slice(0, days * 2)]
      .sort((a, b) => weighted(b) - weighted(a) || a.distanceKm - b.distanceKm)
      .slice(0, budget),
    ...nature,
  ]

  // --- 2. One geographic cluster per day, trimmed to the style's pace.
  const clusters = clusterPlaces(candidates, days).map((cluster) => {
    const keep = [...cluster]
    while (keep.length > style.sightsPerDay) {
      const droppable = keep.filter((p) => p.kind !== 'national_park')
      if (droppable.length === 0) break
      const weakest = droppable.reduce((w, p) => (weighted(p) < weighted(w) ? p : w))
      keep.splice(keep.indexOf(weakest), 1)
    }
    return keep
  })

  // --- 3. Weather-aware cluster→date assignment.
  const dates = Array.from({ length: days }, (_, i) => addDaysISO(request.startDate, i))
  const order = assignClustersToDates(clusters, dates, weatherByDate)

  // --- 4+5. Schedule each day.
  const usedIds = new Set<string>()
  const seedIfEnough = (list: Place[], perDay: number) => {
    const fresh = list.filter((p) => !avoidFoodIds.has(p.id))
    if (fresh.length >= days * perDay) {
      for (const p of list) if (avoidFoodIds.has(p.id)) usedIds.add(p.id)
    }
  }
  seedIfEnough(pool.restaurants, 2)
  seedIfEnough(pool.cafes, 1)
  seedIfEnough(pool.markets, 1)
  const seeded = new Set(usedIds)

  const itineraryDays: ItineraryDay[] = dates.map((date, i) => {
    const weather = weatherByDate.get(date)
    const notes: string[] = []

    let notBefore: number | undefined
    let notAfter: number | undefined
    if (i === 0 && request.flights.arrivalTime) {
      notBefore = hhmmToMinutes(request.flights.arrivalTime) + ARRIVAL_BUFFER_MIN
      notes.push(
        `Flight${request.flights.arrivalFlight ? ` ${request.flights.arrivalFlight}` : ''} lands at ${request.flights.arrivalTime}. ` +
          `Plan starts after ~2.5h for immigration, transfer and check-in.`,
      )
    }
    if (i === days - 1 && request.flights.departureTime) {
      notAfter = hhmmToMinutes(request.flights.departureTime) - DEPARTURE_BUFFER_MIN
      notes.push(
        `Departure${request.flights.departureFlight ? ` (${request.flights.departureFlight})` : ''} at ${request.flights.departureTime}. ` +
          `Head to the airport ~3.5h before take-off.`,
      )
    }

    const { stops, notes: dayNotes } = scheduleDay({
      sights: order[i],
      restaurants: pool.restaurants,
      cafes: pool.cafes,
      markets: pool.markets,
      weather,
      notBefore,
      notAfter,
      usedIds,
      cityCenter: destination,
      style,
      transport: request.transport,
    })

    if (request.travellers >= 5 && stops.some((s) => s.place.kind === 'restaurant')) {
      notes.push(`Reserve ahead for ${request.travellers} — tables for larger groups go early.`)
    }

    return { date, label: `Day ${i + 1}`, weather, stops, notes: [...notes, ...dayNotes] }
  })

  for (const id of usedIds) if (!seeded.has(id)) avoidFoodIds.add(id)

  // --- Summary and base.
  const allStops = itineraryDays.flatMap((d) => d.stops)
  const sightStops = allStops.filter(isSightStop)
  const inTown = allStops.filter((s) => s.place.kind !== 'national_park').map((s) => s.place)
  const base: GeoPoint = centroidOf(inTown) ?? { lat: destination.lat, lon: destination.lon }

  return {
    style: style.id,
    title: style.title,
    tagline: style.tagline,
    days: itineraryDays,
    base,
    stays: rankStays(pool.stays, base, request, destination.name),
    summary: {
      sightCount: sightStops.length,
      travelMin: allStops.reduce((sum, s) => sum + (s.travelFromPrevMin ?? 0), 0),
      indoorShare:
        sightStops.length === 0
          ? 0
          : sightStops.filter((s) => s.place.indoor).length / sightStops.length,
      headlineSights: [...sightStops]
        .sort((a, b) => b.place.score - a.place.score)
        .slice(0, 3)
        .map((s) => s.place.name),
      baseLabel: baseLabel(base, pool.sights, destination.name),
    },
  }
}

/** Share of sights two options have in common (Jaccard index, 0–1). */
export function optionOverlap(a: PlanOption, b: PlanOption): number {
  const ids = (o: PlanOption) =>
    new Set(o.days.flatMap((d) => d.stops).filter(isSightStop).map((s) => s.place.id))
  const A = ids(a)
  const B = ids(b)
  if (A.size === 0 && B.size === 0) return 1
  let shared = 0
  for (const id of A) if (B.has(id)) shared++
  return shared / (A.size + B.size - shared)
}

function baseLabel(base: GeoPoint, sights: Place[], city: string): string {
  const landmark = sights
    .filter((p) => haversineKm(p, base) <= BASE_LABEL_KM)
    .sort((a, b) => b.score - a.score)[0]
  return landmark ? `near ${landmark.name}` : `Central ${city}`
}

const clampDays = (days: number) => Math.max(1, Math.min(14, Math.round(days) || 1))

/**
 * Pair day-clusters with dates: the most outdoor-heavy cluster gets the
 * best-weather date, the most indoor-friendly cluster soaks up the worst.
 */
function assignClustersToDates(
  clusters: Place[][],
  dates: string[],
  weatherByDate: Map<string, DayWeather>,
): Place[][] {
  const n = dates.length
  if (n <= 1) return clusters

  const indices = dates.map((_, i) => i)
  const weatherScore = (date: string): number => {
    const w = weatherByDate.get(date)
    if (!w) return 0.5 // unknown → neutral
    if (isBadWeather(w)) return 0
    return 1 - w.precipProbability / 100
  }
  const outdoorness = (cluster: Place[]): number =>
    cluster.length === 0 ? 0 : cluster.filter((p) => !p.indoor).length / cluster.length

  const datesByWeather = [...indices].sort(
    (a, b) => weatherScore(dates[b]) - weatherScore(dates[a]),
  )
  const clustersByOutdoor = [...indices].sort(
    (a, b) => outdoorness(clusters[b]) - outdoorness(clusters[a]),
  )

  const result: Place[][] = new Array(n)
  datesByWeather.forEach((dateIdx, rank) => {
    result[dateIdx] = clusters[clustersByOutdoor[rank]]
  })
  return result
}

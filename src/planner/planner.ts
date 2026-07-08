import type {
  DayWeather,
  Destination,
  Itinerary,
  ItineraryDay,
  Place,
  TripRequest,
} from '../types'
import { addDaysISO, hhmmToMinutes } from '../types'
import { FORECAST_HORIZON_DAYS, isBadWeather } from '../api/weather'
import type { PlacePool } from '../api/places'
import type { CityInfo } from '../types'
import { clusterPlaces } from './cluster'
import {
  ARRIVAL_BUFFER_MIN,
  DEPARTURE_BUFFER_MIN,
  scheduleDay,
  sightCapacity,
} from './schedule'

export interface PlannerInputs {
  request: TripRequest
  destination: Destination
  pool: PlacePool
  weatherByDate: Map<string, DayWeather>
  cityInfo: CityInfo
}

/**
 * Build the full optimized itinerary:
 *
 * 1. Work out each day's usable window (flight arrival/departure trims)
 *    and how many sights actually fit.
 * 2. Take exactly that many top-scored sights (famous places + the best
 *    city parks mixed in) — so a short first day never swallows sights
 *    a full day had time for.
 * 3. Cluster them geographically, one cluster per day, sized to capacity.
 * 4. Match clusters to dates: capacity first (flight-bound days keep
 *    their short clusters), then weather — outdoor-heavy clusters land
 *    on the best-weather dates, indoor-heavy ones absorb the rain.
 * 5. Fill each day's timeline with sights, an authentic lunch/dinner and
 *    a local café near where the traveller will actually be.
 */
export function buildItinerary(inputs: PlannerInputs): Itinerary {
  const { request, destination, pool, weatherByDate, cityInfo } = inputs
  const days = Math.max(1, Math.min(14, request.days))
  const dates = Array.from({ length: days }, (_, i) => addDaysISO(request.startDate, i))

  // --- 1. Usable window + sight capacity per day.
  const notBefores: (number | undefined)[] = dates.map((_, i) =>
    i === 0 && request.flights.arrivalTime
      ? hhmmToMinutes(request.flights.arrivalTime) + ARRIVAL_BUFFER_MIN
      : undefined,
  )
  const notAfters: (number | undefined)[] = dates.map((_, i) =>
    i === days - 1 && request.flights.departureTime
      ? hhmmToMinutes(request.flights.departureTime) - DEPARTURE_BUFFER_MIN
      : undefined,
  )
  const capacities = dates.map((_, i) => sightCapacity(notBefores[i], notAfters[i]))
  const sightBudget = capacities.reduce((s, c) => s + c, 0)

  // --- 2. Candidate sights: famous places plus the best city parks.
  const parkPicks = pool.parks.slice(0, Math.min(days, Math.floor(sightBudget / 3)))
  const candidates: Place[] = [
    ...pool.sights.slice(0, Math.max(sightBudget - parkPicks.length, 0)),
    ...parkPicks,
  ]

  // --- 3. One geographic cluster per day, sized to that day's capacity.
  const clusters = clusterPlaces(candidates, days, capacities)

  // --- 4. Capacity- and weather-aware cluster→date assignment.
  const order = assignClustersToDates(clusters, dates, capacities, weatherByDate)

  // --- 5. Schedule each day.
  const usedIds = new Set<string>()
  const itineraryDays: ItineraryDay[] = dates.map((date, i) => {
    const weather = weatherByDate.get(date)
    const notes: string[] = []

    const notBefore = notBefores[i]
    const notAfter = notAfters[i]
    if (notBefore !== undefined) {
      notes.push(
        `Flight ${request.flights.arrivalFlight ?? ''} lands at ${request.flights.arrivalTime}. ` +
          `Plan starts after ~2.5h for immigration, transfer and check-in.`,
      )
    }
    if (notAfter !== undefined) {
      notes.push(
        `Departure${request.flights.departureFlight ? ` (${request.flights.departureFlight})` : ''} at ${request.flights.departureTime}. ` +
          `Head to the airport ~3.5h before take-off.`,
      )
    }

    const { stops, notes: dayNotes } = scheduleDay({
      sights: order[i],
      restaurants: pool.restaurants,
      cafes: pool.cafes,
      weather,
      notBefore,
      notAfter,
      usedIds,
      cityCenter: destination,
    })

    if (!weather) {
      notes.push(
        'Weather forecast not yet available for this date — reopen the app closer to departure for a live forecast.',
      )
    }

    return {
      date,
      label: `Day ${i + 1}`,
      weather,
      stops,
      notes: [...notes, ...dayNotes],
    }
  })

  const todayLocal = new Date().toISOString().slice(0, 10)
  const lastForecastable = addDaysISO(todayLocal, FORECAST_HORIZON_DAYS - 1)

  return {
    id: `${destination.name}-${request.startDate}-${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    request: { ...request, days },
    destination,
    cityInfo,
    days: itineraryDays,
    parks: [...pool.nationalParks.slice(0, 6), ...pool.parks.slice(0, 3)],
    forecastPartial: dates.some((d) => d > lastForecastable),
  }
}

/**
 * Pair day-clusters with dates. Capacity is the hard constraint: a big
 * cluster must land on a day with room for it, so flight-trimmed days get
 * the short clusters. Among days of equal capacity (typically all interior
 * days), weather decides: the most outdoor-heavy cluster gets the
 * best-weather date, the most indoor-friendly one soaks up the rain.
 */
function assignClustersToDates(
  clusters: Place[][],
  dates: string[],
  capacities: number[],
  weatherByDate: Map<string, DayWeather>,
): Place[][] {
  const n = dates.length

  const weatherScore = (date: string): number => {
    const w = weatherByDate.get(date)
    if (!w) return 0.5 // unknown → neutral
    if (isBadWeather(w)) return 0
    return 1 - w.precipProbability / 100
  }
  const outdoorness = (cluster: Place[]): number => {
    if (cluster.length === 0) return 0
    return cluster.filter((p) => !p.indoor).length / cluster.length
  }

  const dayRank = dates
    .map((_, i) => i)
    .sort(
      (a, b) =>
        capacities[b] - capacities[a] ||
        weatherScore(dates[b]) - weatherScore(dates[a]),
    )
  const clusterRank = clusters
    .map((_, i) => i)
    .sort(
      (a, b) =>
        clusters[b].length - clusters[a].length ||
        outdoorness(clusters[b]) - outdoorness(clusters[a]),
    )

  const result: Place[][] = new Array(n)
  dayRank.forEach((dayIdx, rank) => {
    result[dayIdx] = clusters[clusterRank[rank]]
  })
  return result
}

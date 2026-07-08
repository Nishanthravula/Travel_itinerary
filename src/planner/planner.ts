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
} from './schedule'

/** Sights we aim to visit per full day. */
const SIGHTS_PER_DAY = 5

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
 * 1. Take the top-scored sights (famous places + one park per day mixed in).
 * 2. Cluster them geographically — one tight cluster per day.
 * 3. Match clusters to dates so outdoor-heavy days land on the best
 *    weather and indoor-heavy days absorb the rain.
 * 4. Trim the first/last day around flight arrival/departure.
 * 5. Fill each day's timeline with sights, an authentic lunch/dinner and
 *    a local café near where the traveller will actually be.
 */
export function buildItinerary(inputs: PlannerInputs): Itinerary {
  const { request, destination, pool, weatherByDate, cityInfo } = inputs
  const days = Math.max(1, Math.min(14, request.days))

  // --- 1. Candidate sights: famous places plus the best city parks.
  const parkPicks = pool.parks.slice(0, days)
  const sightBudget = days * SIGHTS_PER_DAY
  const candidates: Place[] = [
    ...pool.sights.slice(0, Math.max(sightBudget - parkPicks.length, days * 2)),
    ...parkPicks,
  ]

  // --- 2. One geographic cluster per day.
  const clusters = clusterPlaces(candidates, days)

  // --- 3. Weather-aware cluster→date assignment.
  const dates = Array.from({ length: days }, (_, i) => addDaysISO(request.startDate, i))
  const order = assignClustersToDates(clusters, dates, weatherByDate)

  // --- 4+5. Schedule each day.
  const usedIds = new Set<string>()
  const itineraryDays: ItineraryDay[] = dates.map((date, i) => {
    const weather = weatherByDate.get(date)
    const notes: string[] = []

    let notBefore: number | undefined
    let notAfter: number | undefined
    if (i === 0 && request.flights.arrivalTime) {
      notBefore = hhmmToMinutes(request.flights.arrivalTime) + ARRIVAL_BUFFER_MIN
      notes.push(
        `Flight ${request.flights.arrivalFlight ?? ''} lands at ${request.flights.arrivalTime}. ` +
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
 * Pair day-clusters with dates: the most outdoor-heavy cluster gets the
 * best-weather date, the most indoor-friendly cluster soaks up the worst.
 * Arrival/departure days keep their (shorter) clusters in place.
 */
function assignClustersToDates(
  clusters: Place[][],
  dates: string[],
  weatherByDate: Map<string, DayWeather>,
): Place[][] {
  const n = dates.length
  if (n <= 1) return clusters

  // Only reshuffle interior days; day 1 and the last day are flight-bound.
  const swappable: number[] = []
  for (let i = 0; i < n; i++) swappable.push(i)

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

  const datesByWeather = [...swappable].sort(
    (a, b) => weatherScore(dates[b]) - weatherScore(dates[a]),
  )
  const clustersByOutdoor = [...swappable].sort(
    (a, b) => outdoorness(clusters[b]) - outdoorness(clusters[a]),
  )

  const result: Place[][] = new Array(n)
  datesByWeather.forEach((dateIdx, rank) => {
    result[dateIdx] = clusters[clustersByOutdoor[rank]]
  })
  return result
}

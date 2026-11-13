/** Shared builders for planner tests. Test-only — never imported by app code. */
import type { DayWeather, Destination, Place, PlacePool, Stay, TripRequest } from '../types'

export const dest: Destination = {
  name: 'Testville',
  lat: 48.86,
  lon: 2.35,
  country: 'France',
  countryCode: 'FR',
  timezone: 'Europe/Paris',
}

/** Degrees of latitude per km. */
export const KM = 1 / 111.195

let seq = 0
export function place(overrides: Partial<Place> = {}): Place {
  seq++
  return {
    id: `node/${seq}`,
    name: `Place ${seq}`,
    kind: 'attraction',
    lat: 48.86 + (seq % 7) * 0.004,
    lon: 2.35 + (seq % 5) * 0.004,
    score: 5,
    indoor: false,
    distanceKm: 1,
    ...overrides,
  }
}

/** n sights in a line going north, `stepKm` apart. */
export function lineOfSights(n: number, stepKm: number, overrides: Partial<Place> = {}): Place[] {
  return Array.from({ length: n }, (_, i) =>
    place({ lat: 48.86 + i * stepKm * KM, lon: 2.35, ...overrides }),
  )
}

export function stay(overrides: Partial<Stay> = {}): Stay {
  seq++
  return {
    id: `stay/${seq}`,
    name: `Stay ${seq}`,
    type: 'hotel',
    lat: 48.86,
    lon: 2.35,
    score: 1,
    ...overrides,
  }
}

export const sunny: DayWeather = {
  date: '2027-03-12',
  code: 0,
  tMax: 26,
  tMin: 17,
  precipProbability: 5,
  windMax: 10,
  sunrise: '06:30',
  sunset: '21:00',
}
export const rainy: DayWeather = { ...sunny, code: 63, precipProbability: 85 }

export function request(overrides: Partial<TripRequest> = {}): TripRequest {
  return {
    destinationQuery: 'Testville',
    startDate: '2027-03-12',
    endDate: '2027-03-14',
    days: 3,
    travellers: 2,
    transport: 'transit',
    flights: {},
    ...overrides,
  }
}

/** A pool rich enough for three distinct options. */
export function richPool(): PlacePool {
  const kinds = ['attraction', 'museum', 'attraction', 'viewpoint', 'attraction'] as const
  return {
    sights: Array.from({ length: 40 }, (_, i) =>
      place({
        kind: kinds[i % kinds.length],
        indoor: kinds[i % kinds.length] === 'museum',
        score: 12 - (i % 10),
        wikipedia: i % 3 === 0 ? 'en:Something' : undefined,
      }),
    ),
    restaurants: Array.from({ length: 30 }, () => place({ kind: 'restaurant', cuisine: 'french' })),
    cafes: Array.from({ length: 12 }, () => place({ kind: 'cafe' })),
    markets: Array.from({ length: 6 }, () => place({ kind: 'market' })),
    parks: Array.from({ length: 6 }, () => place({ kind: 'park', score: 3 })),
    nationalParks: [],
    stays: [],
  }
}

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { BrowserContext, Route } from '@playwright/test'

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)), 'utf8')

const json = (route: Route, body: string, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body })

export interface MockOptions {
  /** Every Overpass mirror answers 504. */
  placesDown?: boolean
  /** Only the restaurants-and-cafés query fails, on every mirror. */
  foodDown?: boolean
  /** The geocoder finds nothing. */
  noSuchPlace?: boolean
}

/**
 * Serve every third-party API from fixtures. The app must never reach the
 * real network in tests: results would drift and public services would be
 * hit on every CI run.
 */
export async function mockApis(context: BrowserContext, opts: MockOptions = {}) {
  const calls = { overpass: 0, geocode: 0 }

  await context.route('https://geocoding-api.open-meteo.com/**', (route) => {
    calls.geocode++
    return json(route, opts.noSuchPlace ? '{}' : fixture('geocode'))
  })

  await context.route('https://api.open-meteo.com/**', (route) => {
    const url = new URL(route.request().url())
    const start = new Date(`${url.searchParams.get('start_date')}T00:00:00Z`)
    const end = new Date(`${url.searchParams.get('end_date')}T00:00:00Z`)
    const time: string[] = []
    for (let d = start; d <= end; d = new Date(d.getTime() + 86_400_000)) {
      time.push(d.toISOString().slice(0, 10))
    }
    const n = time.length
    return json(
      route,
      JSON.stringify({
        daily: {
          time,
          weather_code: time.map((_, i) => (i === 1 ? 63 : 1)),
          temperature_2m_max: Array(n).fill(19),
          temperature_2m_min: Array(n).fill(11),
          precipitation_probability_max: time.map((_, i) => (i === 1 ? 80 : 10)),
          wind_speed_10m_max: Array(n).fill(14),
          sunrise: time.map((t) => `${t}T06:50`),
          sunset: time.map((t) => `${t}T18:40`),
        },
      }),
    )
  })

  await context.route(/overpass/, (route) => {
    calls.overpass++
    const query = decodeURIComponent(route.request().postData() ?? '')
    if (opts.foodDown && query.includes('"amenity"="restaurant"')) {
      return route.fulfill({ status: 504, body: 'Gateway Timeout' })
    }
    return opts.placesDown
      ? route.fulfill({ status: 504, body: 'Gateway Timeout' })
      : json(route, fixture('overpass'))
  })

  await context.route('https://en.wikipedia.org/**', (route) => json(route, fixture('wiki')))
  await context.route('https://restcountries.com/**', (route) => json(route, fixture('country')))

  // An empty but valid map style: the map initialises without any tiles.
  await context.route('https://tiles.openfreemap.org/**', (route) =>
    json(route, JSON.stringify({ version: 8, sources: {}, layers: [] })),
  )

  return calls
}

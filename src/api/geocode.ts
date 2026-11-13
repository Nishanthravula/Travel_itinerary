import type { Destination } from '../types'
import { fetchJson } from './http'

interface OpenMeteoGeoResult {
  name: string
  latitude: number
  longitude: number
  country?: string
  country_code?: string
  admin1?: string
  timezone?: string
  population?: number
}

const toDestination = (r: OpenMeteoGeoResult): Destination => ({
  name: r.name,
  lat: r.latitude,
  lon: r.longitude,
  country: r.country ?? '',
  countryCode: (r.country_code ?? '').toUpperCase(),
  admin1: r.admin1,
  timezone: r.timezone ?? 'UTC',
  population: r.population,
})

/**
 * Find places matching free text via Open-Meteo's geocoding API (free,
 * keyless, CORS-enabled). Largest first — "Paris" should lead with Paris,
 * France — but every match is returned so the traveller can pick.
 */
export async function searchDestinations(
  query: string,
  signal?: AbortSignal,
): Promise<Destination[]> {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
  url.searchParams.set('name', query.trim())
  url.searchParams.set('count', '6')
  url.searchParams.set('language', 'en')
  url.searchParams.set('format', 'json')

  const data = await fetchJson<{ results?: OpenMeteoGeoResult[] }>(url, {
    timeoutMs: 8000,
    retries: 1,
    signal,
  })
  return [...(data.results ?? [])]
    .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
    .slice(0, 5)
    .map(toDestination)
}

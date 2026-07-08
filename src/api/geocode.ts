import type { Destination } from '../types'

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

/**
 * Geocode a free-text destination via Open-Meteo's geocoding API
 * (free, keyless, CORS-enabled).
 */
export async function geocodeDestination(query: string): Promise<Destination> {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
  url.searchParams.set('name', query.trim())
  url.searchParams.set('count', '5')
  url.searchParams.set('language', 'en')
  url.searchParams.set('format', 'json')

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Geocoding failed (HTTP ${res.status})`)
  const data = (await res.json()) as { results?: OpenMeteoGeoResult[] }

  const results = data.results ?? []
  if (results.length === 0) {
    throw new Error(`Could not find "${query}". Try "City, Country" (e.g. "Kyoto, Japan").`)
  }
  // Prefer the most populous match — free text like "Paris" should mean
  // Paris, France rather than Paris, Texas.
  const best = [...results].sort((a, b) => (b.population ?? 0) - (a.population ?? 0))[0]

  return {
    name: best.name,
    lat: best.latitude,
    lon: best.longitude,
    country: best.country ?? '',
    countryCode: (best.country_code ?? '').toUpperCase(),
    admin1: best.admin1,
    timezone: best.timezone ?? 'UTC',
    population: best.population,
  }
}

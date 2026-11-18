import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Destination } from '../types'
import { fetchWikipediaPlaces, parseWikipediaGeo, wikipediaGeoUrl } from './wikipedia'

const dest: Destination = {
  name: 'New York', lat: 40.714, lon: -74.006, country: 'United States', countryCode: 'US', timezone: 'America/New_York',
}
let id = 100
const page = (title: string, description: string | undefined, length: number, lat = 40.72, lon = -74.0) => ({
  pageid: ++id, ns: 0, title, description, length, coordinates: [{ lat, lon, primary: '' }],
})
const response = (...pages: ReturnType<typeof page>[]) => ({
  query: { pages: Object.fromEntries(pages.map((p) => [String(p.pageid), p])) },
})

afterEach(() => vi.unstubAllGlobals())

describe('wikipediaGeoUrl', () => {
  it('searches articles with coordinates around the destination, browser-safe', () => {
    const u = new URL(wikipediaGeoUrl(dest, 'car'))
    expect(u.origin + u.pathname).toBe('https://en.wikipedia.org/w/api.php')
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      action: 'query', generator: 'geosearch', ggscoord: '40.714|-74.006', ggslimit: '500',
      prop: 'coordinates|description|info', colimit: 'max', format: 'json', origin: '*',
    })
  })
  it('never asks for more than Wikipedia allows (10 km)', () => {
    expect(new URL(wikipediaGeoUrl(dest, 'car')).searchParams.get('ggsradius')).toBe('10000')
    expect(new URL(wikipediaGeoUrl(dest, 'walk')).searchParams.get('ggsradius')).toBe('5000')
  })
})

describe('parseWikipediaGeo', () => {
  const pool = parseWikipediaGeo(
    response(
      page('Statue of Liberty', 'Colossal neoclassical sculpture in New York Harbor', 180_000),
      page('Metropolitan Museum of Art', 'Art museum in New York City', 150_000),
      page('Central Park', 'Urban park in Manhattan, New York City', 160_000),
      page('Brooklyn Bridge', 'Suspension bridge in New York City', 120_000),
      page('Top of the Rock', 'Observation deck in Manhattan', 9_000),
      page('The Plaza Hotel', 'Hotel in Manhattan, New York', 60_000),
      page('Tribeca', 'Neighborhood in Manhattan, New York City', 40_000),
      page('Canal Street station', 'New York City Subway station complex', 30_000),
      page('Stuyvesant High School', 'Public high school in Manhattan', 50_000),
      page('Some Building', undefined, 3_000),
    ),
    dest,
  )

  it('keeps landmarks, museums and viewpoints as sights', () => {
    expect(pool.sights.map((p) => p.name)).toEqual(
      expect.arrayContaining(['Statue of Liberty', 'Metropolitan Museum of Art', 'Brooklyn Bridge', 'Top of the Rock']),
    )
    expect(pool.sights.find((p) => p.name === 'Metropolitan Museum of Art')).toMatchObject({ kind: 'museum', indoor: true })
    expect(pool.sights.find((p) => p.name === 'Top of the Rock')!.kind).toBe('viewpoint')
  })
  it('puts parks with the parks and hotels with the stays', () => {
    expect(pool.parks.map((p) => p.name)).toEqual(['Central Park'])
    expect(pool.stays.map((s) => s.name)).toEqual(['The Plaza Hotel'])
    expect(pool.stays[0].type).toBe('hotel')
  })
  it('leaves out neighbourhoods, stations, schools and undescribed pages', () => {
    const all = [...pool.sights, ...pool.parks, ...pool.stays].map((p) => p.name)
    for (const name of ['Tribeca', 'Canal Street station', 'Stuyvesant High School', 'Some Building']) {
      expect(all).not.toContain(name)
    }
  })
  it('ranks the better-documented sight first and links the article', () => {
    expect(pool.sights[0].name).toBe('Statue of Liberty')
    expect(pool.sights[0].website).toBe('https://en.wikipedia.org/wiki/Statue_of_Liberty')
    expect(pool.sights[0].wikipedia).toBe('en:Statue of Liberty')
  })
  it('handles an empty or malformed answer', () => {
    expect(parseWikipediaGeo({}, dest).sights).toEqual([])
    expect(parseWikipediaGeo({ query: { pages: { 1: { title: 'X' } } } }, dest).sights).toEqual([])
  })
})

describe('fetchWikipediaPlaces', () => {
  it('fetches once and parses', async () => {
    const fetchMock = vi.fn(async () => Response.json(response(page('Statue of Liberty', 'Colossal sculpture in New York Harbor', 9000))))
    vi.stubGlobal('fetch', fetchMock)
    const pool = await fetchWikipediaPlaces(dest, 'transit')
    expect(pool.sights).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Destination } from '../types'
import { OVERPASS_MIRRORS, buildQuery, overpassProvider, parseOverpass, type OverpassElement } from './overpass'
import { searchDestinations } from './geocode'

const dest: Destination = {
  name: 'Kyoto', lat: 35.01, lon: 135.77, country: 'Japan', countryCode: 'JP', timezone: 'Asia/Tokyo',
}
let id = 0
const node = (tags: Record<string, string>, extra: Partial<OverpassElement> = {}): OverpassElement => ({
  type: 'node', id: ++id, lat: 35.01, lon: 135.77, tags, ...extra,
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('parseOverpass', () => {
  it('sorts places into the pool by kind', () => {
    const pool = parseOverpass(
      [
        node({ tourism: 'museum', name: 'M' }),
        node({ tourism: 'viewpoint', name: 'V' }),
        node({ amenity: 'restaurant', name: 'R', cuisine: 'japanese' }),
        node({ amenity: 'cafe', name: 'C' }),
        node({ amenity: 'marketplace', name: 'Nishiki Market' }),
        node({ shop: 'bakery', name: 'B' }),
        node({ leisure: 'park', name: 'P', wikidata: 'Q1' }),
        node({ boundary: 'national_park', name: 'NP' }),
      ],
      dest,
    )
    expect(pool.sights.map((p) => p.kind).sort()).toEqual(['museum', 'viewpoint'])
    expect(pool.restaurants).toHaveLength(1)
    expect(pool.cafes).toHaveLength(1)
    expect(pool.markets).toHaveLength(2)
    expect(pool.parks).toHaveLength(1)
    expect(pool.nationalParks).toHaveLength(1)
  })

  it('reads stays with type, stars and parking', () => {
    const pool = parseOverpass(
      [
        node({ tourism: 'hotel', name: 'Grand', stars: '4', parking: 'yes', website: 'https://g.test' }),
        node({ tourism: 'hostel', name: 'Bunk', stars: '4S' }),
        node({ tourism: 'apartment', name: 'Flat', parking: 'no' }),
        node({ tourism: 'guest_house', name: 'Ryokan' }),
      ],
      dest,
    )
    const by = Object.fromEntries(pool.stays.map((s) => [s.name, s]))
    expect(by.Grand).toMatchObject({ type: 'hotel', stars: 4, parking: true, website: 'https://g.test' })
    expect(by.Bunk).toMatchObject({ type: 'hostel', stars: 4 })
    expect(by.Flat.parking).toBe(false)
    expect(by.Ryokan.type).toBe('guest_house')
    expect(by.Grand.score).toBeGreaterThan(by.Ryokan.score)
    expect(pool.sights).toHaveLength(0)
  })

  it('prefers the English name when one is tagged', () => {
    const pool = parseOverpass(
      [
        node({ tourism: 'attraction', name: '清水寺', 'name:en': 'Kiyomizu-dera' }),
        node({ tourism: 'attraction', name: '金閣寺' }),
      ],
      dest,
    )
    expect(pool.sights.map((p) => p.name).sort()).toEqual(['Kiyomizu-dera', '金閣寺'])
  })

  it('drops duplicates mapped as both a node and a way', () => {
    const pool = parseOverpass(
      [
        node({ tourism: 'museum', name: 'Same' }),
        { type: 'way', id: 99, center: { lat: 35.0, lon: 135.7 }, tags: { tourism: 'museum', name: 'Same' } },
      ],
      dest,
    )
    expect(pool.sights).toHaveLength(1)
  })

  it('scores a chain restaurant below a local one', () => {
    const pool = parseOverpass(
      [
        node({ amenity: 'restaurant', name: 'Chain', cuisine: 'burger', brand: 'Chain' }),
        node({ amenity: 'restaurant', name: 'Local', cuisine: 'kaiseki' }),
      ],
      dest,
    )
    expect(pool.restaurants[0].name).toBe('Local')
  })

  it('skips elements with no name or no position', () => {
    const pool = parseOverpass(
      [node({ tourism: 'museum' }), { type: 'way', id: 5, tags: { tourism: 'museum', name: 'Nowhere' } }],
      dest,
    )
    expect(pool.sights).toHaveLength(0)
  })
})

describe('buildQuery', () => {
  it('searches as far as the transport mode reaches', () => {
    expect(buildQuery(dest, 'walk')).toContain('around:5000,35.01,135.77')
    expect(buildQuery(dest, 'car')).toContain('around:30000,35.01,135.77')
  })
  it('asks for places to stay', () => {
    expect(buildQuery(dest, 'transit')).toMatch(/tourism.*hotel\|guest_house\|hostel\|apartment/)
  })
})

describe('overpassProvider', () => {
  it('falls back to the next mirror with the same query', async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('Gateway Timeout', { status: 504 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ elements: [node({ tourism: 'museum', name: 'M' })] }), { status: 200 }),
      )
    vi.stubGlobal('fetch', fetchMock)
    const p = overpassProvider.fetchPool(dest, 'transit')
    await vi.advanceTimersByTimeAsync(60_000)
    const pool = await p
    expect(pool.sights).toHaveLength(1)
    expect(String(fetchMock.mock.calls[0][0])).toBe(OVERPASS_MIRRORS[0])
    expect(String(fetchMock.mock.calls[1][0])).toBe(OVERPASS_MIRRORS[1])
    expect(fetchMock.mock.calls[1][1].body).toBe(fetchMock.mock.calls[0][1].body)
  })
})

describe('searchDestinations', () => {
  it('returns an empty list when nothing matches', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })))
    expect(await searchDestinations('zzzz')).toEqual([])
  })
  it('returns candidates with country and region, largest first', async () => {
    const results = [
      { name: 'Paris', latitude: 33.66, longitude: -95.55, country: 'United States', country_code: 'us', admin1: 'Texas', population: 25000, timezone: 'America/Chicago' },
      { name: 'Paris', latitude: 48.85, longitude: 2.35, country: 'France', country_code: 'fr', admin1: 'Île-de-France', population: 2100000, timezone: 'Europe/Paris' },
    ]
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ results }), { status: 200 })))
    const found = await searchDestinations('Paris')
    expect(found.map((d) => d.country)).toEqual(['France', 'United States'])
    expect(found[1]).toMatchObject({ admin1: 'Texas', countryCode: 'US' })
  })
})

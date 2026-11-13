import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Destination } from '../types'
import { OVERPASS_MIRRORS, buildQueries, overpassProvider, parseOverpass, safeUrl, type OverpassElement } from './overpass'
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
        node({ tourism: 'hotel', name: 'Grand', stars: '4', parking: 'yes', website: 'https://g.test/' }),
        node({ tourism: 'hostel', name: 'Bunk', stars: '4S' }),
        node({ tourism: 'apartment', name: 'Flat', parking: 'no' }),
        node({ tourism: 'guest_house', name: 'Ryokan' }),
      ],
      dest,
    )
    const by = Object.fromEntries(pool.stays.map((s) => [s.name, s]))
    expect(by.Grand).toMatchObject({ type: 'hotel', stars: 4, parking: true, website: 'https://g.test/' })
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

describe('safeUrl', () => {
  it('keeps http and https links', () => {
    expect(safeUrl('https://hotel.pt/x')).toBe('https://hotel.pt/x')
    expect(safeUrl('http://hotel.pt')).toBe('http://hotel.pt/')
  })
  it('completes a bare domain', () => {
    expect(safeUrl('www.hotel.pt')).toBe('https://www.hotel.pt/')
  })
  it('drops anything that is not a web address', () => {
    expect(safeUrl('javascript:alert(1)')).toBeUndefined()
    expect(safeUrl('mailto:a@b.pt')).toBeUndefined()
    expect(safeUrl('see reception')).toBeUndefined()
    expect(safeUrl(undefined)).toBeUndefined()
  })
  it('is applied to places and stays', () => {
    const pool = parseOverpass(
      [
        node({ tourism: 'hotel', name: 'H', website: 'www.h.pt' }),
        node({ tourism: 'museum', name: 'M', website: 'javascript:alert(1)' }),
      ],
      dest,
    )
    expect(pool.stays[0].website).toBe('https://www.h.pt/')
    expect(pool.sights[0].website).toBeUndefined()
  })
})

describe('buildQueries', () => {
  it('searches for sights as far as the transport mode reaches', () => {
    expect(buildQueries(dest, 'walk').sights).toContain('around:5000,35.01,135.77')
    expect(buildQueries(dest, 'car').sights).toContain('around:30000,35.01,135.77')
  })
  it('keeps the food search small: points only, close to the centre', () => {
    const { food } = buildQueries(dest, 'car')
    expect(food).toContain('around:8000,')
    expect(food).not.toMatch(/\bnwr\b/)
    expect(food).toContain('node["amenity"="restaurant"]')
  })
  it('asks for places to stay within 12 km', () => {
    const { stays } = buildQueries(dest, 'car')
    expect(stays).toMatch(/tourism.*hotel\|guest_house\|hostel\|apartment/)
    expect(stays).toContain('around:12000,')
  })
  it('only asks for parks that are notable enough to have a Wikidata entry', () => {
    const { parks } = buildQueries(dest, 'car')
    for (const line of parks.split('\n').filter((l) => /leisure|boundary/.test(l))) {
      expect(line).toContain('["wikidata"]')
    }
  })
  it('gives every part its own short server-side time limit', () => {
    for (const q of Object.values(buildQueries(dest, 'car'))) expect(q).toContain('[timeout:25]')
  })
})

describe('overpassProvider', () => {
  type Part = 'sights' | 'food' | 'stays' | 'parks'
  const partOf = (init: RequestInit): Part => {
    const q = decodeURIComponent(String(init.body))
    if (q.includes('"amenity"="restaurant"')) return 'food'
    if (q.includes('guest_house')) return 'stays'
    if (q.includes('national_park')) return 'parks'
    return 'sights'
  }
  const answers: Record<Part, OverpassElement[]> = {
    sights: [node({ tourism: 'museum', name: 'M' })],
    food: [node({ amenity: 'restaurant', name: 'R', cuisine: 'japanese' }), node({ amenity: 'cafe', name: 'C' })],
    stays: [node({ tourism: 'hotel', name: 'H' })],
    parks: [node({ leisure: 'park', name: 'P', wikidata: 'Q1' })],
  }
  const ok = (part: Part) => new Response(JSON.stringify({ elements: answers[part] }), { status: 200 })
  const down = () => new Response('Gateway Timeout', { status: 504 })

  /** Run a fetchPool call to completion under fake timers. */
  async function run(respond: (part: Part, url: string, nth: number) => Response) {
    vi.useFakeTimers()
    const seen: Record<Part, string[]> = { sights: [], food: [], stays: [], parks: [] }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown, init: RequestInit) => {
        const part = partOf(init)
        seen[part].push(String(url))
        return respond(part, String(url), seen[part].length)
      }),
    )
    const settled = overpassProvider.fetchPool(dest, 'car').then(
      (pool) => ({ pool, error: undefined }),
      (error: unknown) => ({ pool: undefined, error }),
    )
    await vi.advanceTimersByTimeAsync(600_000)
    return { ...(await settled), seen }
  }

  it('asks for sights, food, stays and parks separately and merges the answers', async () => {
    const { pool, seen } = await run((part) => ok(part))
    expect(Object.values(seen).map((u) => u.length)).toEqual([1, 1, 1, 1])
    expect(pool).toMatchObject({ missing: [] })
    expect(pool!.sights.map((p) => p.name)).toEqual(['M'])
    expect(pool!.restaurants.map((p) => p.name)).toEqual(['R'])
    expect(pool!.cafes.map((p) => p.name)).toEqual(['C'])
    expect(pool!.stays.map((p) => p.name)).toEqual(['H'])
    expect(pool!.parks.map((p) => p.name)).toEqual(['P'])
  })

  it('spreads the parts across mirrors instead of queueing on one server', async () => {
    const { seen } = await run((part) => ok(part))
    const firstHosts = new Set(Object.values(seen).map((u) => u[0]))
    expect(firstHosts.size).toBe(OVERPASS_MIRRORS.length)
  })

  it('retries a failed part on the next mirror', async () => {
    const { pool, seen } = await run((part, _url, nth) => (part === 'sights' && nth === 1 ? down() : ok(part)))
    expect(pool!.sights).toHaveLength(1)
    expect(seen.sights).toHaveLength(2)
    expect(seen.sights[1]).not.toBe(seen.sights[0])
  })

  it('still returns a pool, marked incomplete, when food cannot be loaded', async () => {
    const { pool, seen } = await run((part) => (part === 'food' ? down() : ok(part)))
    expect(seen.food).toHaveLength(OVERPASS_MIRRORS.length)
    expect(pool!.sights).toHaveLength(1)
    expect(pool!.restaurants).toEqual([])
    expect(pool!.missing).toEqual(['food'])
  })

  it('fails when the sights themselves cannot be loaded', async () => {
    const { pool, error } = await run((part) => (part === 'sights' ? down() : ok(part)))
    expect(pool).toBeUndefined()
    expect(error).toMatchObject({ name: 'HttpError' })
  })

  it('does not accept a partial answer that Overpass marks as timed out', async () => {
    const remark = 'runtime error: Query timed out in "query" at line 3 after 26 seconds.'
    const { pool, error, seen } = await run((part) =>
      part === 'sights'
        ? new Response(JSON.stringify({ elements: answers.sights, remark }), { status: 200 })
        : ok(part),
    )
    expect(pool).toBeUndefined()
    expect(error).toMatchObject({ name: 'HttpError' })
    expect(seen.sights).toHaveLength(OVERPASS_MIRRORS.length)
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

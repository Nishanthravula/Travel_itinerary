import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../../netlify/functions/places.mts'

const env = new Map<string, string>()
beforeEach(() => {
  env.clear()
  vi.stubGlobal('Netlify', { env: { get: (k: string) => env.get(k) } })
})
afterEach(() => vi.unstubAllGlobals())

const post = (body: unknown) =>
  new Request('https://site.test/.netlify/functions/places', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
const good = { lat: 40.7128, lon: -74.006, name: 'New York', mode: 'car' }
const place = (id: string) => ({
  id, displayName: { text: id }, location: { latitude: 40.72, longitude: -74 }, rating: 4.5, userRatingCount: 100,
})
const partOf = (init: RequestInit): string => {
  const types = (JSON.parse(String(init.body)) as { includedTypes: string[] }).includedTypes
  if (types.includes('restaurant')) return 'restaurants'
  if (types.includes('lodging')) return 'stays'
  if (types.includes('cafe')) return 'cafes'
  if (types.includes('bar')) return 'markets'
  if (types.includes('park')) return 'parks'
  return 'sights'
}

describe('places function', () => {
  it('answers 501 when no Google key is configured, so the app uses the free source', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const res = await handler(post(good))
    expect(res.status).toBe(501)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a malformed request without calling Google', async () => {
    env.set('GOOGLE_PLACES_API_KEY', 'k')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect((await handler(post('{nope'))).status).toBe(400)
    expect((await handler(post({ ...good, lat: 'x' }))).status).toBe(400)
    expect((await handler(post({ ...good, lat: 400 }))).status).toBe(400)
    expect((await handler(post({ ...good, mode: 'boat' }))).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('only accepts POST', async () => {
    env.set('GOOGLE_PLACES_API_KEY', 'k')
    const res = await handler(new Request('https://site.test/.netlify/functions/places'))
    expect(res.status).toBe(405)
  })

  it('searches Google with the secret key and returns a pool', async () => {
    env.set('GOOGLE_PLACES_API_KEY', 'secret-key')
    const fetchMock = vi.fn(async (_url: unknown, init: RequestInit) =>
      Response.json({ places: [place(`${partOf(init)}-1`)] }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const res = await handler(post(good))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const pool = await res.json()
    expect(pool.source).toBe('google')
    expect(pool.sights.length).toBeGreaterThan(0)
    expect(pool.restaurants.length).toBeGreaterThan(0)
    expect(pool.stays.length).toBeGreaterThan(0)
    expect(JSON.stringify(pool)).not.toContain('secret-key')

    expect(fetchMock).toHaveBeenCalledTimes(9)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://places.googleapis.com/v1/places:searchNearby')
    const headers = new Headers(init.headers)
    expect(headers.get('X-Goog-Api-Key')).toBe('secret-key')
    expect(headers.get('X-Goog-FieldMask')).toContain('places.displayName')
  })

  it('still answers, marking what is missing, when the restaurant searches fail', async () => {
    env.set('GOOGLE_PLACES_API_KEY', 'k')
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init: RequestInit) =>
      partOf(init) === 'restaurants' ? new Response('{}', { status: 500 }) : Response.json({ places: [place(`${partOf(init)}-1`)] }),
    ))
    const res = await handler(post(good))
    expect(res.status).toBe(200)
    expect((await res.json()).missing).toEqual(['food'])
  })

  it('answers 503 when Google gives no sights (quota used up or key rejected)', async () => {
    env.set('GOOGLE_PLACES_API_KEY', 'k')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":{"status":"RESOURCE_EXHAUSTED"}}', { status: 429 })))
    expect((await handler(post(good))).status).toBe(503)
  })
})

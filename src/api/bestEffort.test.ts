import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Destination } from '../types'
import { addDaysISO } from '../types'
import { fetchCityInfo } from './cityInfo'
import { fetchTripWeather } from './weather'

const dest: Destination = {
  name: 'Lisbon', lat: 38.72, lon: -9.14, country: 'Portugal', countryCode: 'PT', timezone: 'Europe/Lisbon',
}
afterEach(() => vi.unstubAllGlobals())

describe('best-effort sources never fail a plan', () => {
  it('returns no forecast when the weather service is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    const tomorrow = addDaysISO(new Date().toISOString().slice(0, 10), 1)
    expect((await fetchTripWeather(dest, tomorrow, 3)).size).toBe(0)
  })
  it('still gives currency and languages, from bundled data, when Wikipedia is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    expect(await fetchCityInfo(dest)).toEqual({
      timezone: 'Europe/Lisbon', currency: 'Euro (€)', languages: 'Portuguese',
    })
  })
  it('makes no request to the retired REST Countries service', async () => {
    const fetchMock = vi.fn(async (url: unknown) => new Response(String(url) && 'nope', { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)
    await fetchCityInfo(dest)
    expect(fetchMock.mock.calls.map((c) => String(c[0])).join(' ')).not.toContain('restcountries')
  })
  it('includes a banner photo of the city from its Wikipedia summary', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: unknown) =>
      String(url).includes('/page/summary/')
        ? Response.json({
            type: 'standard',
            extract: 'Lisbon is the capital of Portugal.',
            content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Lisbon' } },
            originalimage: { source: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Lisbon.jpg', width: 1200, height: 800 },
          })
        : new Response('nope', { status: 404 }),
    ))
    expect((await fetchCityInfo(dest)).image).toEqual({
      url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Lisbon.jpg',
      pageUrl: 'https://en.wikipedia.org/wiki/Lisbon',
    })
  })
})

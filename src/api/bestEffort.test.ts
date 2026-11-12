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
  it('returns just the timezone when city facts are unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    expect(await fetchCityInfo(dest)).toEqual({ timezone: 'Europe/Lisbon' })
  })
})

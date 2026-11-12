import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LegacyItinerary, PlacePool, Trip } from '../types'
import { getCachedPool, poolKey, putCachedPool } from './poolCache'
import { deleteTrip, loadTrips, migrateLegacy, saveTrip } from './storage'

function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size
    },
  }
}

const legacy: LegacyItinerary = {
  id: 'Kyoto-2026-08-01-abc',
  createdAt: '2026-07-01T00:00:00.000Z',
  request: { destinationQuery: 'Kyoto', startDate: '2026-08-01', days: 2, flights: {} },
  destination: { name: 'Kyoto', lat: 35, lon: 135.7, country: 'Japan', countryCode: 'JP', timezone: 'Asia/Tokyo' },
  cityInfo: { timezone: 'Asia/Tokyo' },
  days: [
    { date: '2026-08-01', label: 'Day 1', notes: [], stops: [
      { place: { id: 'node/1', name: 'Kinkaku-ji', kind: 'attraction', lat: 35.04, lon: 135.73, score: 9, indoor: false, distanceKm: 4 }, startMin: 540, durationMin: 105 },
    ] },
    { date: '2026-08-02', label: 'Day 2', notes: [], stops: [] },
  ],
  parks: [],
  forecastPartial: false,
}
const trip = (id: string): Trip => ({ ...migrateLegacy(legacy), id })

beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()))

describe('saved trips', () => {
  it('migrates a v1 itinerary into a single highlights option', () => {
    const t = migrateLegacy(legacy)
    expect(t.options).toHaveLength(1)
    expect(t.options[0]).toMatchObject({ style: 'highlights', stays: [] })
    expect(t.options[0].days).toEqual(legacy.days)
    expect(t.options[0].summary).toMatchObject({ sightCount: 1, headlineSights: ['Kinkaku-ji'] })
    expect(t.request).toMatchObject({ startDate: '2026-08-01', endDate: '2026-08-02', days: 2, travellers: 2, transport: 'transit' })
  })
  it('reads v1 saved trips when no v2 data exists yet', () => {
    localStorage.setItem('wayfarer.trips.v1', JSON.stringify([legacy]))
    const trips = loadTrips()
    expect(trips).toHaveLength(1)
    expect(trips[0].options[0].days).toHaveLength(2)
    expect(localStorage.getItem('wayfarer.trips.v2')).not.toBeNull()
  })
  it('saves newest first, replaces by id, caps at 20, and deletes', () => {
    for (let i = 0; i < 22; i++) saveTrip(trip(`t${i}`))
    expect(loadTrips()).toHaveLength(20)
    expect(loadTrips()[0].id).toBe('t21')
    saveTrip(trip('t10'))
    expect(loadTrips()[0].id).toBe('t10')
    expect(loadTrips()).toHaveLength(20)
    expect(deleteTrip('t10').some((t) => t.id === 't10')).toBe(false)
  })
  it('survives corrupt stored data', () => {
    localStorage.setItem('wayfarer.trips.v2', '{not json')
    expect(loadTrips()).toEqual([])
  })
  it('drops the oldest trip and retries when storage is full', () => {
    saveTrip(trip('old'))
    saveTrip(trip('mid'))
    const real = localStorage.setItem.bind(localStorage)
    let failures = 1
    localStorage.setItem = (k: string, v: string) => {
      if (failures-- > 0) throw new DOMException('full', 'QuotaExceededError')
      real(k, v)
    }
    const after = saveTrip(trip('new'))
    expect(after.map((t) => t.id)).toEqual(['new', 'mid'])
  })
})

describe('place pool cache', () => {
  const pool: PlacePool = { sights: [], restaurants: [], cafes: [], markets: [], parks: [], nationalParks: [], stays: [] }
  it('keys by rounded position and transport', () => {
    expect(poolKey({ lat: 38.72234, lon: -9.13934 }, 'car')).toBe('38.722,-9.139:car')
  })
  it('returns what was stored', async () => {
    await putCachedPool('k1', pool)
    expect(await getCachedPool('k1')).toEqual(pool)
    expect(await getCachedPool('missing')).toBeNull()
  })
  it('expires entries after seven days', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2027-01-01T00:00:00Z'))
    await putCachedPool('k2', pool)
    vi.setSystemTime(new Date('2027-01-07T23:00:00Z'))
    expect(await getCachedPool('k2')).toEqual(pool)
    vi.setSystemTime(new Date('2027-01-08T01:00:00Z'))
    expect(await getCachedPool('k2')).toBeNull()
    vi.useRealTimers()
  })
})

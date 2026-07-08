import { describe, expect, it } from 'vitest'
import type { DayWeather, Place, TripRequest, Destination } from '../types'
import { hhmmToMinutes, minutesToHHMM } from '../types'
import { clusterPlaces } from './cluster'
import { scheduleDay, ARRIVAL_BUFFER_MIN, DEPARTURE_BUFFER_MIN } from './schedule'
import { buildItinerary } from './planner'
import type { PlacePool } from '../api/places'

const dest: Destination = {
  name: 'Testville',
  lat: 48.86,
  lon: 2.35,
  country: 'France',
  countryCode: 'FR',
  timezone: 'Europe/Paris',
}

let seq = 0
function place(overrides: Partial<Place> = {}): Place {
  seq++
  return {
    id: `node/${seq}`,
    name: `Place ${seq}`,
    kind: 'attraction',
    lat: 48.86 + (seq % 7) * 0.01,
    lon: 2.35 + (seq % 5) * 0.01,
    score: 5,
    indoor: false,
    distanceKm: 1,
    ...overrides,
  }
}

const sunny: DayWeather = {
  date: '2026-08-01',
  code: 0,
  tMax: 26,
  tMin: 17,
  precipProbability: 5,
  windMax: 10,
  sunrise: '06:30',
  sunset: '21:00',
}
const rainy: DayWeather = { ...sunny, code: 63, precipProbability: 85 }

function pool(): PlacePool {
  return {
    sights: Array.from({ length: 20 }, (_, i) =>
      place({ kind: i % 4 === 0 ? 'museum' : 'attraction', indoor: i % 4 === 0 }),
    ),
    restaurants: Array.from({ length: 10 }, () =>
      place({ kind: 'restaurant', cuisine: 'french' }),
    ),
    cafes: Array.from({ length: 6 }, () => place({ kind: 'cafe' })),
    parks: Array.from({ length: 4 }, () => place({ kind: 'park', score: 2 })),
    nationalParks: [place({ kind: 'national_park', distanceKm: 45 })],
  }
}

describe('clusterPlaces', () => {
  it('produces k clusters covering every place exactly once', () => {
    const places = Array.from({ length: 12 }, () => place())
    const clusters = clusterPlaces(places, 3)
    expect(clusters).toHaveLength(3)
    const ids = clusters.flat().map((p) => p.id)
    expect(ids).toHaveLength(12)
    expect(new Set(ids).size).toBe(12)
  })

  it('keeps cluster sizes balanced (no empty days)', () => {
    const places = Array.from({ length: 15 }, () => place())
    const clusters = clusterPlaces(places, 3)
    for (const c of clusters) {
      expect(c.length).toBeGreaterThanOrEqual(3)
      expect(c.length).toBeLessThanOrEqual(7)
    }
  })

  it('is deterministic', () => {
    const places = Array.from({ length: 10 }, () => place())
    const a = clusterPlaces(places, 2).map((c) => c.map((p) => p.id).sort())
    const b = clusterPlaces(places, 2).map((c) => c.map((p) => p.id).sort())
    expect(a).toEqual(b)
  })

  it('handles more days than places', () => {
    const clusters = clusterPlaces([place()], 3)
    expect(clusters).toHaveLength(3)
    expect(clusters.flat()).toHaveLength(1)
  })

  it('honours per-day capacity targets without dropping anyone', () => {
    const places = Array.from({ length: 10 }, () => place())
    const clusters = clusterPlaces(places, 3, [3, 5, 2])
    const sizes = clusters.map((c) => c.length).sort((a, b) => b - a)
    expect(sizes).toEqual([5, 3, 2])
    expect(new Set(clusters.flat().map((p) => p.id)).size).toBe(10)
  })
})

describe('scheduleDay', () => {
  const base = () => ({
    sights: Array.from({ length: 6 }, () => place()),
    restaurants: Array.from({ length: 8 }, () => place({ kind: 'restaurant' })),
    cafes: Array.from({ length: 4 }, () => place({ kind: 'cafe' })),
    usedIds: new Set<string>(),
    cityCenter: dest,
  })

  it('fills a full day with morning start and dinner', () => {
    const { stops } = scheduleDay({ ...base(), weather: sunny })
    expect(stops.length).toBeGreaterThanOrEqual(6)
    expect(minutesToHHMM(stops[0].startMin)).toBe('09:00')
    expect(stops.at(-1)!.place.kind).toBe('restaurant')
  })

  it('starts after flight arrival + buffer on arrival day', () => {
    const arrival = hhmmToMinutes('13:00')
    const { stops } = scheduleDay({
      ...base(),
      weather: sunny,
      notBefore: arrival + ARRIVAL_BUFFER_MIN,
    })
    expect(stops.length).toBeGreaterThan(0)
    for (const s of stops) {
      expect(s.startMin).toBeGreaterThanOrEqual(arrival + ARRIVAL_BUFFER_MIN)
    }
  })

  it('ends before departure cut-off on last day', () => {
    const departure = hhmmToMinutes('18:00')
    const cutoff = departure - DEPARTURE_BUFFER_MIN
    const { stops } = scheduleDay({ ...base(), weather: sunny, notAfter: cutoff })
    for (const s of stops) {
      expect(s.startMin + s.durationMin).toBeLessThanOrEqual(cutoff)
    }
  })

  it('prioritises indoor sights and adds a note on rainy days', () => {
    const inputs = base()
    inputs.sights = [
      place({ indoor: false, score: 9 }),
      place({ kind: 'museum', indoor: true, score: 1 }),
      place({ indoor: false, score: 8 }),
    ]
    const { stops, notes } = scheduleDay({ ...inputs, weather: rainy })
    const firstSight = stops.find((s) =>
      ['attraction', 'museum'].includes(s.place.kind),
    )!
    expect(firstSight.place.indoor).toBe(true)
    expect(notes.some((n) => n.toLowerCase().includes('rain'))).toBe(true)
  })

  it('never books the same restaurant twice across a trip', () => {
    const used = new Set<string>()
    const restaurants = Array.from({ length: 8 }, () => place({ kind: 'restaurant' }))
    const picked: string[] = []
    for (let d = 0; d < 3; d++) {
      const { stops } = scheduleDay({
        ...base(),
        restaurants,
        usedIds: used,
        weather: sunny,
      })
      picked.push(
        ...stops.filter((s) => s.place.kind === 'restaurant').map((s) => s.place.id),
      )
    }
    expect(new Set(picked).size).toBe(picked.length)
  })
})

describe('buildItinerary', () => {
  const request: TripRequest = {
    destinationQuery: 'Testville',
    startDate: '2026-08-01',
    days: 3,
    flights: { arrivalTime: '11:30', departureTime: '19:00' },
  }

  it('creates one day per requested day with consecutive dates', () => {
    const it_ = buildItinerary({
      request,
      destination: dest,
      pool: pool(),
      weatherByDate: new Map(),
      cityInfo: { timezone: dest.timezone },
    })
    expect(it_.days.map((d) => d.date)).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
    ])
    expect(it_.days.every((d) => d.stops.length > 0)).toBe(true)
  })

  it('sends outdoor-heavy days to the best weather', () => {
    const weather = new Map<string, DayWeather>([
      ['2026-08-01', { ...rainy, date: '2026-08-01' }],
      ['2026-08-02', { ...sunny, date: '2026-08-02' }],
      ['2026-08-03', { ...rainy, date: '2026-08-03' }],
    ])
    // No flights: all days share full capacity, so assignment is
    // purely weather-driven.
    const it_ = buildItinerary({
      request: { ...request, flights: {} },
      destination: dest,
      pool: pool(),
      weatherByDate: weather,
      cityInfo: { timezone: dest.timezone },
    })
    const outdoorShare = (d: (typeof it_.days)[0]) => {
      const sights = d.stops.filter((s) =>
        ['attraction', 'museum', 'park', 'viewpoint'].includes(s.place.kind),
      )
      if (sights.length === 0) return 0
      return sights.filter((s) => !s.place.indoor).length / sights.length
    }
    const sunnyDay = it_.days[1]
    const rainyDays = [it_.days[0], it_.days[2]]
    for (const rd of rainyDays) {
      expect(outdoorShare(sunnyDay)).toBeGreaterThanOrEqual(outdoorShare(rd))
    }
  })

  it('respects flight windows on first and last day', () => {
    const it_ = buildItinerary({
      request,
      destination: dest,
      pool: pool(),
      weatherByDate: new Map(),
      cityInfo: { timezone: dest.timezone },
    })
    const first = it_.days[0]
    const arrivalReady = hhmmToMinutes('11:30') + ARRIVAL_BUFFER_MIN
    for (const s of first.stops) expect(s.startMin).toBeGreaterThanOrEqual(arrivalReady)

    const last = it_.days.at(-1)!
    const cutoff = hhmmToMinutes('19:00') - DEPARTURE_BUFFER_MIN
    for (const s of last.stops)
      expect(s.startMin + s.durationMin).toBeLessThanOrEqual(cutoff)
  })

  it('never drops the top sight onto a flight-trimmed day it cannot fit', () => {
    const p = pool()
    const star = place({ name: 'Tour Eiffel', score: 25, lat: 48.858, lon: 2.294 })
    p.sights = [star, ...p.sights]
    const it_ = buildItinerary({
      request, // arrival 11:30, departure 19:00 — short first & last days
      destination: dest,
      pool: p,
      weatherByDate: new Map(),
      cityInfo: { timezone: dest.timezone },
    })
    const allStops = it_.days.flatMap((d) => d.stops.map((s) => s.place.name))
    expect(allStops).toContain('Tour Eiffel')
  })

  it('flags trips beyond the forecast horizon', () => {
    const farFuture = { ...request, startDate: '2030-01-01' }
    const it_ = buildItinerary({
      request: farFuture,
      destination: dest,
      pool: pool(),
      weatherByDate: new Map(),
      cityInfo: { timezone: dest.timezone },
    })
    expect(it_.forecastPartial).toBe(true)
    expect(it_.days[0].notes.join(' ')).toMatch(/forecast/i)
  })
})

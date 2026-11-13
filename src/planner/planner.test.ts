import { describe, expect, it } from 'vitest'
import type { DayWeather, PlanOption, PlacePool } from '../types'
import { addDaysISO } from '../types'
import { buildOption, buildTrip, optionOverlap, type PlannerInputs } from './planner'
import { STYLES } from './styles'
import { KM, dest, place, rainy, request, richPool, sunny } from './testFixtures'

const cityInfo = { timezone: 'Europe/Paris' }

function inputs(overrides: Partial<PlannerInputs> = {}): PlannerInputs {
  return {
    request: request(),
    destination: dest,
    pool: richPool(),
    weatherByDate: new Map(),
    cityInfo,
    ...overrides,
  }
}

const sightIds = (o: PlanOption) =>
  o.days.flatMap((d) => d.stops).filter((s) => !['restaurant', 'cafe', 'market'].includes(s.place.kind)).map((s) => s.place.id)
const foodIds = (o: PlanOption) =>
  o.days.flatMap((d) => d.stops).filter((s) => s.place.kind === 'restaurant').map((s) => s.place.id)

describe('buildTrip', () => {
  it('builds three options in a fixed order from a rich pool', () => {
    const trip = buildTrip(inputs())
    expect(trip.options.map((o) => o.style)).toEqual(['highlights', 'food', 'easy'])
    expect(trip.notice).toBeUndefined()
  })

  it('gives every option one day per requested day, on consecutive dates', () => {
    const trip = buildTrip(inputs())
    for (const o of trip.options) {
      expect(o.days.map((d) => d.date)).toEqual(['2027-03-12', '2027-03-13', '2027-03-14'])
      expect(o.days.map((d) => d.label)).toEqual(['Day 1', 'Day 2', 'Day 3'])
    }
  })

  it('makes the highlights option the busiest', () => {
    const [highlights, , easy] = buildTrip(inputs()).options
    expect(highlights.summary.sightCount).toBeGreaterThan(easy.summary.sightCount)
    expect(highlights.summary.sightCount).toBe(sightIds(highlights).length)
  })

  it('does not share a restaurant between options when the pool allows', () => {
    const all = buildTrip(inputs()).options.flatMap(foodIds)
    expect(all.length).toBeGreaterThan(12)
    expect(new Set(all).size).toBe(all.length)
  })

  it('still feeds every option when restaurants are scarce', () => {
    const pool = richPool()
    pool.restaurants = pool.restaurants.slice(0, 7)
    for (const o of buildTrip(inputs({ pool })).options) {
      expect(foodIds(o).length).toBeGreaterThanOrEqual(5)
      expect(new Set(foodIds(o)).size).toBe(foodIds(o).length) // never twice within one plan
    }
  })

  it('keeps options meaningfully different', () => {
    const [highlights, food, easy] = buildTrip(inputs()).options
    expect(optionOverlap(highlights, easy)).toBeLessThan(0.8)
    expect(optionOverlap(highlights, food)).toBeLessThan(0.8)
  })

  it('offers a single option with a notice when the pool is thin', () => {
    const pool: PlacePool = { ...richPool(), sights: richPool().sights.slice(0, 4), parks: [] }
    const trip = buildTrip(inputs({ pool }))
    expect(trip.options).toHaveLength(1)
    expect(trip.options[0].style).toBe('highlights')
    expect(trip.notice).toMatch(/Only 1 distinct plan/)
    expect(trip.notice).toContain('Testville')
  })

  it('builds a one-day trip', () => {
    const trip = buildTrip(inputs({ request: request({ endDate: '2027-03-12', days: 1 }) }))
    expect(trip.options.length).toBeGreaterThanOrEqual(1)
    expect(trip.options[0].days).toHaveLength(1)
  })

  it('sends outdoor-heavy days to the best weather', () => {
    const weatherByDate = new Map<string, DayWeather>([
      ['2027-03-12', { ...rainy, date: '2027-03-12' }],
      ['2027-03-13', { ...sunny, date: '2027-03-13' }],
      ['2027-03-14', { ...sunny, date: '2027-03-14' }],
    ])
    const [highlights] = buildTrip(inputs({ weatherByDate })).options
    const indoorShare = (i: number) => {
      const s = highlights.days[i].stops.filter((x) => x.place.kind !== 'restaurant' && x.place.kind !== 'cafe')
      return s.filter((x) => x.place.indoor).length / Math.max(s.length, 1)
    }
    expect(indoorShare(0)).toBeGreaterThanOrEqual(Math.max(indoorShare(1), indoorShare(2)))
  })

  it('respects flight windows on the first and last day', () => {
    const req = request({ flights: { arrivalTime: '13:00', departureTime: '17:00' } })
    for (const o of buildTrip(inputs({ request: req })).options) {
      expect(o.days[0].stops[0].startMin).toBeGreaterThanOrEqual(13 * 60 + 150)
      const last = o.days[2].stops
      expect(Math.max(...last.map((s) => s.startMin + s.durationMin))).toBeLessThanOrEqual(17 * 60 - 210)
    }
  })

  it('flags trips beyond the forecast horizon', () => {
    const today = new Date().toISOString().slice(0, 10)
    const start = addDaysISO(today, 30)
    const far = buildTrip(inputs({ request: request({ startDate: start, endDate: addDaysISO(start, 2) }) }))
    expect(far.forecastPartial).toBe(true)
    const soon = buildTrip(inputs({ request: request({ startDate: addDaysISO(today, 1), endDate: addDaysISO(today, 3) }) }))
    expect(soon.forecastPartial).toBe(false)
  })

  it('adds a nearby national park to a car plan but not a walking plan', () => {
    const park = place({ kind: 'national_park', name: 'Big Park', lat: 48.86 + 20 * KM, lon: 2.35, score: 9, distanceKm: 20 })
    const withPark = (transport: 'car' | 'walk') => {
      const pool = { ...richPool(), nationalParks: [park] }
      const trip = buildTrip(inputs({ pool, request: request({ transport }) }))
      return trip.options.some((o) => sightIds(o).includes(park.id))
    }
    expect(withPark('car')).toBe(true)
    expect(withPark('walk')).toBe(false)
  })
})

describe('buildTrip edge cases found in review', () => {
  it('explains a trip that is all travel instead of blaming the map data', () => {
    const req = request({ endDate: '2027-03-12', days: 1, flights: { arrivalTime: '20:00' } })
    const trip = buildTrip(inputs({ request: req }))
    expect(trip.options).toHaveLength(1)
    expect(trip.options[0].days[0].stops).toEqual([])
    expect(trip.notice).toMatch(/flight times leave no time/)
    expect(trip.notice).not.toMatch(/mapped data/)
  })

  it('gives the same request the same id, so re-planning replaces the saved trip', () => {
    const a = buildTrip(inputs())
    const b = buildTrip(inputs())
    expect(a.id).toBe(b.id)
    expect(buildTrip(inputs({ request: request({ travellers: 4 }) })).id).not.toBe(a.id)
    expect(buildTrip(inputs({ request: request({ transport: 'car' }) })).id).not.toBe(a.id)
    expect(buildTrip(inputs({ request: request({ flights: { arrivalTime: '09:00' } }) })).id).not.toBe(a.id)
  })

  it('serves lunch and dinner on every full day of every option', () => {
    for (const transport of ['walk', 'transit', 'car'] as const) {
      for (const o of buildTrip(inputs({ request: request({ transport }) })).options) {
        for (const d of o.days) {
          const meals = d.stops.filter((s) => s.place.kind === 'restaurant')
          expect(meals, `${o.style} ${transport} ${d.label}`).toHaveLength(2)
        }
      }
    }
  })
})

describe('buildOption', () => {
  it('summarises the plan for its card', () => {
    const o = buildOption(inputs(), STYLES.highlights, new Set())
    expect(o.title).toBe('Highlights')
    expect(o.summary.headlineSights).toHaveLength(3)
    expect(o.summary.travelMin).toBeGreaterThan(0)
    expect(o.summary.indoorShare).toBeGreaterThanOrEqual(0)
    expect(o.summary.indoorShare).toBeLessThanOrEqual(1)
    expect(o.summary.baseLabel).toMatch(/^(near |Central )/)
  })

  it('centres the base on its own stops', () => {
    const o = buildOption(inputs(), STYLES.easy, new Set())
    expect(Math.abs(o.base.lat - 48.87)).toBeLessThan(0.03)
    expect(Math.abs(o.base.lon - 2.36)).toBeLessThan(0.03)
  })
})

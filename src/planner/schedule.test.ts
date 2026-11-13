import { describe, expect, it } from 'vitest'
import type { ItineraryStop, Place, TransportMode } from '../types'
import { hhmmToMinutes } from '../types'
import { ARRIVAL_BUFFER_MIN, DEPARTURE_BUFFER_MIN, scheduleDay, type DayInputs } from './schedule'
import { STYLES, type PlanStyle } from './styles'
import { KM, dest, lineOfSights, place, rainy, sunny } from './testFixtures'

const food = () => ({
  restaurants: Array.from({ length: 10 }, () => place({ kind: 'restaurant', cuisine: 'french' })),
  cafes: Array.from({ length: 5 }, () => place({ kind: 'cafe' })),
})

function day(
  sights: Place[],
  style: PlanStyle,
  transport: TransportMode,
  extra: Partial<DayInputs> = {},
) {
  return scheduleDay({
    sights,
    ...food(),
    weather: sunny,
    usedIds: new Set<string>(),
    cityCenter: dest,
    style,
    transport,
    ...extra,
  })
}

const isSight = (s: ItineraryStop) =>
  ['attraction', 'museum', 'viewpoint', 'park', 'national_park'].includes(s.place.kind)
const isMeal = (s: ItineraryStop) => s.place.kind === 'restaurant'
const end = (s: ItineraryStop) => s.startMin + s.durationMin

describe('STYLES', () => {
  it('pins the spec pace and window for each style', () => {
    expect(STYLES.highlights).toMatchObject({ sightsPerDay: 5, dayStart: '09:00', dayEnd: '21:30' })
    expect(STYLES.food).toMatchObject({ sightsPerDay: 3, dayStart: '10:00', dayEnd: '22:00', extraFoodStop: true })
    expect(STYLES.easy).toMatchObject({ sightsPerDay: 3, dayStart: '10:00', dayEnd: '20:00' })
  })
})

describe('scheduleDay', () => {
  it('fills a highlights day with up to five sights, lunch and dinner', () => {
    const { stops } = day(lineOfSights(6, 0.8), STYLES.highlights, 'transit')
    expect(stops.filter(isSight).length).toBeLessThanOrEqual(5)
    expect(stops.filter(isSight).length).toBeGreaterThanOrEqual(4)
    expect(stops.filter(isMeal)).toHaveLength(2)
    expect(stops[0].startMin).toBe(hhmmToMinutes('09:00'))
  })

  it('never overlaps: each stop starts after the previous ends plus travel', () => {
    const { stops } = day(lineOfSights(6, 0.8), STYLES.highlights, 'transit')
    for (let i = 1; i < stops.length; i++) {
      const travel = stops[i].travelFromPrevMin
      expect(travel).toBeGreaterThanOrEqual(0)
      expect(stops[i].startMin).toBeGreaterThanOrEqual(end(stops[i - 1]) + travel!)
    }
    expect(stops[0].travelFromPrevMin).toBeUndefined()
  })

  it('keeps an easy-pace day to three sights between 10:00 and 20:00', () => {
    const { stops } = day(lineOfSights(6, 0.8), STYLES.easy, 'transit')
    const sights = stops.filter(isSight)
    expect(sights.length).toBeLessThanOrEqual(3)
    expect(stops[0].startMin).toBeGreaterThanOrEqual(600)
    expect(Math.max(...sights.map(end))).toBeLessThanOrEqual(1200)
    // Dinner closes the day and must begin within the window.
    expect(stops[stops.length - 1].startMin).toBeLessThanOrEqual(1200)
  })

  it('gives the food style long meals and an extra food stop', () => {
    const markets = [place({ kind: 'market' }), place({ kind: 'market' })]
    const { stops } = day(lineOfSights(6, 0.8), STYLES.food, 'transit', { markets })
    const meals = stops.filter(isMeal)
    expect(meals).toHaveLength(2)
    expect(meals.every((m) => m.durationMin === 105)).toBe(true)
    expect(stops.filter((s) => s.place.kind === 'market')).toHaveLength(1)
  })

  it('still serves lunch, coffee and dinner at sensible hours on a day with one sight', () => {
    const { stops } = day(lineOfSights(1, 0.8), STYLES.highlights, 'transit')
    const [lunch, dinner] = stops.filter(isMeal)
    expect(lunch.startMin).toBeGreaterThanOrEqual(hhmmToMinutes('12:00'))
    expect(lunch.startMin).toBeLessThanOrEqual(hhmmToMinutes('13:00'))
    expect(dinner.startMin).toBeGreaterThanOrEqual(hhmmToMinutes('18:30'))
    const cafe = stops.find((s) => s.place.kind === 'cafe')!
    expect(cafe.startMin).toBeGreaterThanOrEqual(hhmmToMinutes('15:15'))
  })

  it('eats near the day’s stops rather than at a higher-rated place across town', () => {
    const sights = lineOfSights(4, 0.5)
    const farStars = Array.from({ length: 14 }, (_, i) =>
      place({ kind: 'restaurant', score: 9, lat: 48.86 + (8 + i * 0.1) * KM, lon: 2.35 }),
    )
    const localSpots = Array.from({ length: 4 }, (_, i) =>
      place({ kind: 'restaurant', score: 2, lat: 48.86 + i * 0.3 * KM, lon: 2.352 }),
    )
    const { stops } = day(sights, STYLES.highlights, 'transit', { restaurants: [...farStars, ...localSpots] })
    const meals = stops.filter(isMeal)
    expect(meals).toHaveLength(2)
    for (const m of meals) expect(localSpots.map((p) => p.id)).toContain(m.place.id)
  })

  it('still ends an easy-pace day with dinner when the last sight runs to the day’s end', () => {
    for (const step of [0.3, 0.8, 1.5, 3]) {
      const { stops } = day(lineOfSights(6, step), STYLES.easy, 'transit')
      expect(stops.filter(isMeal), `sights ${step} km apart`).toHaveLength(2)
    }
  })

  it('fits fewer sights on foot than by car when they are far apart', () => {
    const far = () => lineOfSights(6, 6)
    const walk = day(far(), STYLES.highlights, 'walk').stops.filter(isSight).length
    const car = day(far(), STYLES.highlights, 'car').stops.filter(isSight).length
    expect(walk).toBeLessThan(car)
  })

  it('flags a long walking leg and suggests transit', () => {
    const { notes } = day(lineOfSights(3, 3), STYLES.highlights, 'walk')
    expect(notes.some((n) => n.includes('consider transit'))).toBe(true)
  })

  it('returns an empty day without throwing when flights leave no window', () => {
    const { stops } = day(lineOfSights(6, 0.8), STYLES.highlights, 'transit', {
      notBefore: 1140,
      notAfter: 1150,
    })
    expect(stops).toEqual([])
  })

  it('starts after flight arrival plus buffer on the arrival day', () => {
    const notBefore = hhmmToMinutes('11:00') + ARRIVAL_BUFFER_MIN
    const { stops } = day(lineOfSights(6, 0.8), STYLES.highlights, 'transit', { notBefore })
    expect(stops.length).toBeGreaterThan(0)
    expect(stops[0].startMin).toBeGreaterThanOrEqual(notBefore)
  })

  it('ends before the departure cut-off on the last day', () => {
    const notAfter = hhmmToMinutes('18:00') - DEPARTURE_BUFFER_MIN
    const { stops } = day(lineOfSights(6, 0.8), STYLES.highlights, 'transit', { notAfter })
    expect(stops.length).toBeGreaterThan(0)
    expect(Math.max(...stops.map(end))).toBeLessThanOrEqual(notAfter)
  })

  it('puts indoor sights first and adds a note on rainy days', () => {
    const sights = [
      ...lineOfSights(3, 0.8),
      ...lineOfSights(2, 0.8, { kind: 'museum', indoor: true }),
    ]
    const { stops, notes } = day(sights, STYLES.highlights, 'transit', { weather: rainy })
    expect(stops.filter(isSight)[0].place.indoor).toBe(true)
    expect(notes.some((n) => n.startsWith('Rain likely'))).toBe(true)
  })

  it('saves a viewpoint for golden hour on a clear evening', () => {
    const sights = [...lineOfSights(4, 0.8), ...lineOfSights(1, 0.8, { kind: 'viewpoint' })]
    const { stops } = day(sights, STYLES.highlights, 'transit', {
      weather: { ...sunny, sunset: '19:00' },
    })
    const view = stops.find((s) => s.place.kind === 'viewpoint')!
    expect(view.note).toContain('Golden hour')
    expect(view.startMin).toBeGreaterThanOrEqual(hhmmToMinutes('17:45'))
  })

  it('never books the same restaurant twice across days', () => {
    const shared = food()
    const usedIds = new Set<string>()
    const names: string[] = []
    for (let d = 0; d < 3; d++) {
      const { stops } = day(lineOfSights(5, 0.8), STYLES.highlights, 'transit', { ...shared, usedIds })
      names.push(...stops.filter(isMeal).map((s) => s.place.id))
    }
    expect(new Set(names).size).toBe(names.length)
  })
})

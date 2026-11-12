import { describe, expect, it } from 'vitest'
import { daysBetweenInclusive, type GeoPoint } from '../types'
import { TRANSPORT, hopBetween, hopMinutes } from './transport'

// Two points 1 km apart along a meridian (1 km ≈ 0.008993° of latitude).
const a: GeoPoint = { lat: 48.86, lon: 2.35 }
const b: GeoPoint = { lat: 48.86 + 1 / 111.195, lon: 2.35 }

describe('transport profiles', () => {
  it('pins the spec values for each mode', () => {
    expect(TRANSPORT.walk).toMatchObject({
      radiusKm: 5, speedKmh: 4.5, detour: 1.3, overheadMin: 0, includeNature: false,
    })
    expect(TRANSPORT.transit).toMatchObject({
      radiusKm: 12, speedKmh: 16, detour: 1.4, overheadMin: 8, includeNature: false,
    })
    expect(TRANSPORT.car).toMatchObject({
      radiusKm: 30, speedKmh: 28, detour: 1.4, overheadMin: 10, includeNature: true,
    })
  })
})

describe('hopMinutes', () => {
  it('estimates a 1 km walk as 17 minutes', () => {
    expect(hopMinutes(a, b, 'walk')).toBe(17)
  })
  it('adds the fixed overhead for transit', () => {
    expect(hopMinutes(a, b, 'transit')).toBe(13)
  })
  it('is zero for the same place, with no overhead', () => {
    expect(hopMinutes(a, a, 'car')).toBe(0)
  })
})

describe('hopBetween', () => {
  const near: GeoPoint = { lat: 48.86 + 0.4 / 111.195, lon: 2.35 }
  it('walks a short hop when that beats waiting for transit', () => {
    expect(hopBetween(a, near, 'transit')).toEqual({ minutes: 7, by: 'walk' })
  })
  it('walks a short hop rather than moving the car', () => {
    expect(hopBetween(a, near, 'car').by).toBe('walk')
  })
  it('keeps the chosen mode for a longer hop', () => {
    expect(hopBetween(a, b, 'transit')).toEqual({ minutes: 13, by: 'transit' })
  })
})

describe('daysBetweenInclusive', () => {
  it('counts both ends of the range', () => {
    expect(daysBetweenInclusive('2027-03-12', '2027-03-16')).toBe(5)
  })
  it('is not thrown off by a daylight-saving change', () => {
    expect(daysBetweenInclusive('2027-03-28', '2027-03-29')).toBe(2)
  })
})

import { describe, expect, it } from 'vitest'
import type { Destination } from '../types'
import { FIELD_MASK, googleSearches, parseGoogle, type GooglePlace } from './google'

const dest: Destination = {
  name: 'New York', lat: 40.7128, lon: -74.006, country: 'United States', countryCode: 'US', timezone: 'America/New_York',
}
let n = 0
const g = (over: Partial<GooglePlace> = {}): GooglePlace => ({
  id: `pid-${++n}`,
  displayName: { text: `Place ${n}` },
  location: { latitude: 40.72, longitude: -74.0 },
  rating: 4.5,
  userRatingCount: 1000,
  ...over,
})

describe('googleSearches', () => {
  const searches = googleSearches(dest, 'car')
  it('keeps a plan to nine searches so the free monthly allowance goes far', () => {
    expect(searches).toHaveLength(9)
  })
  it('asks for the 20 most popular places each time, inside a circle', () => {
    for (const s of searches) {
      expect(s.body.maxResultCount).toBe(20)
      expect(s.body.rankPreference).toBe('POPULARITY')
      expect(s.body.locationRestriction.circle.center).toEqual({ latitude: 40.7128, longitude: -74.006 })
    }
  })
  it('reaches as far as the transport mode for sights, but stays close for food', () => {
    const radius = (part: string) => searches.filter((s) => s.part === part).map((s) => s.body.locationRestriction.circle.radius)
    expect(Math.max(...radius('sights'))).toBe(30_000)
    expect(Math.max(...radius('restaurants'))).toBeLessThanOrEqual(8_000)
    expect(Math.max(...googleSearches(dest, 'walk').map((s) => s.body.locationRestriction.circle.radius))).toBe(5_000)
  })
  it('covers every part of a plan', () => {
    expect([...new Set(searches.map((s) => s.part))].sort()).toEqual(
      ['cafes', 'markets', 'parks', 'restaurants', 'sights', 'stays'],
    )
  })
  it('only requests fields the app shows', () => {
    expect(FIELD_MASK.split(',')).toEqual(expect.arrayContaining([
      'places.id', 'places.displayName', 'places.location', 'places.rating', 'places.userRatingCount',
    ]))
    expect(FIELD_MASK).not.toMatch(/reviews|photos|editorialSummary/)
  })
})

describe('parseGoogle', () => {
  it('sorts each part into the pool and marks the source', () => {
    const pool = parseGoogle(
      [
        { part: 'sights', places: [g({ types: ['tourist_attraction'] }), g({ primaryType: 'museum', types: ['museum'] })] },
        { part: 'restaurants', places: [g({ primaryType: 'italian_restaurant' })] },
        { part: 'cafes', places: [g()] },
        { part: 'markets', places: [g()] },
        { part: 'parks', places: [g({ primaryType: 'park' })] },
        { part: 'stays', places: [g({ primaryType: 'hostel' }), g({ primaryType: 'lodging' })] },
      ],
      dest,
    )
    expect(pool.source).toBe('google')
    expect(pool.sights.map((p) => p.kind).sort()).toEqual(['attraction', 'museum'])
    expect(pool.sights.find((p) => p.kind === 'museum')!.indoor).toBe(true)
    expect(pool.restaurants[0]).toMatchObject({ kind: 'restaurant', cuisine: 'italian' })
    expect(pool.cafes[0].kind).toBe('cafe')
    expect(pool.markets[0].kind).toBe('market')
    expect(pool.parks[0].kind).toBe('park')
    expect(pool.stays.map((s) => s.type).sort()).toEqual(['hostel', 'hotel'])
    expect(pool.missing).toEqual([])
  })
  it('carries rating, review count, price level and the Google Maps link', () => {
    const pool = parseGoogle(
      [{ part: 'restaurants', places: [g({ rating: 4.6, userRatingCount: 2310, priceLevel: 'PRICE_LEVEL_MODERATE', googleMapsUri: 'https://maps.google.com/?cid=1', websiteUri: 'https://r.example' })] }],
      dest,
    )
    expect(pool.restaurants[0]).toMatchObject({
      rating: 4.6, ratingCount: 2310, priceLevel: '$$', mapsUrl: 'https://maps.google.com/?cid=1', website: 'https://r.example/',
    })
    expect(pool.restaurants[0].placeId).toMatch(/^pid-/)
  })
  it('ranks a well-reviewed favourite above a barely-reviewed one', () => {
    const famous = g({ rating: 4.6, userRatingCount: 50_000 })
    const obscure = g({ rating: 4.9, userRatingCount: 12 })
    const pool = parseGoogle([{ part: 'sights', places: [obscure, famous] }], dest)
    expect(pool.sights[0].placeId).toBe(famous.id)
  })
  it('keeps one copy of a place returned by two searches', () => {
    const same = g()
    const pool = parseGoogle([{ part: 'sights', places: [same] }, { part: 'sights', places: [same] }], dest)
    expect(pool.sights).toHaveLength(1)
  })
  it('skips places without a name or position, and closed ones', () => {
    const pool = parseGoogle(
      [{ part: 'sights', places: [g({ displayName: undefined }), g({ location: undefined }), g({ businessStatus: 'CLOSED_PERMANENTLY' })] }],
      dest,
    )
    expect(pool.sights).toEqual([])
  })
  it('records the parts that could not be loaded', () => {
    const pool = parseGoogle([{ part: 'sights', places: [g()] }], dest, ['restaurants', 'stays'])
    expect(pool.missing).toEqual(['food', 'stays'])
  })
  it('drops a website that is not a web address', () => {
    const pool = parseGoogle([{ part: 'sights', places: [g({ websiteUri: 'javascript:alert(1)' })] }], dest)
    expect(pool.sights[0].website).toBeUndefined()
  })
})

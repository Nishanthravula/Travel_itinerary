import { describe, expect, it } from 'vitest'
import type { ItineraryStop, PlanOption } from '../types'
import { embedUrl } from './googleEmbed'

const stop = (placeId: string | undefined, i: number): ItineraryStop => ({
  place: { id: `google/${placeId}`, placeId, name: `P${i}`, kind: 'attraction', lat: 40.7 + i * 0.01, lon: -74, score: 5, indoor: false, distanceKm: 1 },
  startMin: 600 + i * 60,
  durationMin: 45,
})
const option = (ids: Array<string | undefined>): PlanOption => ({
  style: 'highlights', title: 'Highlights', tagline: '',
  days: [{ date: '2027-03-12', label: 'Day 1', notes: [], stops: ids.map(stop) }],
  base: { lat: 40.71, lon: -74.0 },
  stays: [],
  summary: { sightCount: ids.length, travelMin: 0, indoorShare: 0, headlineSights: [], baseLabel: '' },
})
const params = (url: string) => new URL(url).searchParams

describe('embedUrl', () => {
  it('draws a day as a route through its stops, in order', () => {
    const url = embedUrl(option(['a', 'b', 'c', 'd']), 0, 'car', 'KEY')
    expect(url.startsWith('https://www.google.com/maps/embed/v1/directions?')).toBe(true)
    expect(Object.fromEntries(params(url))).toMatchObject({
      key: 'KEY', origin: 'place_id:a', destination: 'place_id:d', waypoints: 'place_id:b|place_id:c', mode: 'driving',
    })
  })
  it('routes on foot for a walking trip', () => {
    expect(params(embedUrl(option(['a', 'b']), 0, 'walk', 'K')).get('mode')).toBe('walking')
    expect(params(embedUrl(option(['a', 'b']), 0, 'walk', 'K')).get('waypoints')).toBeNull()
  })
  it('falls back to coordinates for a stop with no place id', () => {
    expect(params(embedUrl(option([undefined, 'b']), 0, 'car', 'K')).get('origin')).toBe('40.7,-74')
  })
  it('never sends more than 20 waypoints', () => {
    const many = Array.from({ length: 30 }, (_, i) => `p${i}`)
    expect(params(embedUrl(option(many), 0, 'car', 'K')).get('waypoints')!.split('|')).toHaveLength(20)
  })
  it('pins a day with a single stop', () => {
    const url = embedUrl(option(['a']), 0, 'car', 'K')
    expect(url).toContain('/embed/v1/place?')
    expect(params(url).get('q')).toBe('place_id:a')
  })
  it('shows the area for an empty day', () => {
    const url = embedUrl(option([]), 0, 'car', 'K')
    expect(url).toContain('/embed/v1/view?')
    expect(params(url).get('center')).toBe('40.71,-74')
  })
  it('searches for places to stay around the plan on the Stay tab', () => {
    const url = embedUrl(option(['a', 'b']), 'stay', 'car', 'K')
    expect(url).toContain('/embed/v1/search?')
    expect(Object.fromEntries(params(url))).toMatchObject({ q: 'hotels', center: '40.71,-74' })
  })
})

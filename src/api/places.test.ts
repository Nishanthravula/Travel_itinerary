import { describe, expect, it } from 'vitest'
import type { Place } from '../types'
import { buildPool } from './places'

let seq = 0
function place(overrides: Partial<Place> = {}): Place {
  seq++
  return {
    id: `node/${seq}`,
    name: `Place ${seq}`,
    kind: 'attraction',
    lat: 48.86,
    lon: 2.35,
    score: 5,
    indoor: false,
    distanceKm: 1,
    ...overrides,
  }
}

describe('buildPool fame ranking', () => {
  it('puts world-famous places first even when farther from the centre', () => {
    const landmark = place({
      name: 'Tour Eiffel',
      qid: 'Q243',
      distanceKm: 4.2,
      score: 10,
    })
    const incidental = place({
      name: 'Small Chapel',
      qid: 'Q999',
      distanceKm: 0.2,
      score: 10,
    })
    const untagged = place({ name: 'Plain Statue', distanceKm: 0.1, score: 10 })

    const fame = new Map([
      ['Q243', 287],
      ['Q999', 2],
    ])
    const pool = buildPool([incidental, untagged, landmark], fame)

    expect(pool.sights.map((p) => p.name)).toEqual([
      'Tour Eiffel',
      'Small Chapel',
      'Plain Statue',
    ])
  })

  it('degrades gracefully to tag scores when fame lookup fails', () => {
    const a = place({ name: 'A', score: 9, distanceKm: 2, qid: 'Q1' })
    const b = place({ name: 'B', score: 9, distanceKm: 1, qid: 'Q2' })
    const pool = buildPool([a, b], new Map())
    // Equal scores → nearer first, same as pre-fame behaviour.
    expect(pool.sights.map((p) => p.name)).toEqual(['B', 'A'])
  })

  it('boosts famous cafés and restaurants too', () => {
    const legendary = place({
      name: 'Café de Flore',
      kind: 'cafe',
      qid: 'Q672433',
      distanceKm: 3,
      score: 9,
    })
    const generic = place({ name: 'Corner Cafe', kind: 'cafe', distanceKm: 0.3, score: 9 })
    const pool = buildPool([generic, legendary], new Map([['Q672433', 31]]))
    expect(pool.cafes[0].name).toBe('Café de Flore')
  })

  it('does not mutate the caller-visible score of the input array', () => {
    const p = place({ qid: 'Q1', score: 5 })
    buildPool([p], new Map([['Q1', 100]]))
    expect(p.score).toBe(5)
  })
})

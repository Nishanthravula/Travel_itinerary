import { describe, expect, it } from 'vitest'
import type { ItineraryDay, ItineraryStop, PlaceKind } from '../types'
import { daySegments } from './dayBar'

const stop = (kind: PlaceKind, startMin: number, durationMin: number, travelFromPrevMin?: number): ItineraryStop => ({
  place: { id: `${kind}-${startMin}`, name: kind, kind, lat: 0, lon: 0, score: 1, indoor: false, distanceKm: 0 },
  startMin, durationMin, travelFromPrevMin,
})
const day = (...stops: ItineraryStop[]): ItineraryDay => ({ date: '2027-03-12', label: 'Day 1', notes: [], stops })

describe('daySegments', () => {
  const segs = daySegments(day(stop('attraction', 540, 90), stop('restaurant', 660, 60, 30), stop('museum', 750, 120, 30)))

  it('spans the day from 8:00 to 22:00 by default', () => {
    expect(segs[0]).toMatchObject({ kind: 'sight', start: (540 - 480) / 840, width: 90 / 840 })
  })
  it('draws travel just before the stop it leads to', () => {
    const travel = segs.filter((s) => s.kind === 'travel')
    expect(travel).toHaveLength(2)
    expect(travel[0]).toMatchObject({ start: (660 - 30 - 480) / 840, width: 30 / 840 })
  })
  it('groups stops into sight, food and rest', () => {
    expect(segs.filter((s) => s.kind !== 'travel').map((s) => s.kind)).toEqual(['sight', 'food', 'sight'])
    const parkDay = daySegments(day(stop('park', 600, 60)))
    expect(parkDay[0].kind).toBe('nature')
  })
  it('stretches the window for a day that runs late', () => {
    const late = daySegments(day(stop('restaurant', 1320, 90)))
    const end = late[0].start + late[0].width
    expect(end).toBeLessThanOrEqual(1)
    expect(end).toBeCloseTo(1)
  })
  it('is empty for an empty day', () => {
    expect(daySegments(day())).toEqual([])
  })
})

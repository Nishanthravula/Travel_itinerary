import type { ItineraryDay, PlaceKind } from '../types'

export type SegmentKind = 'sight' | 'food' | 'nature' | 'travel'

export interface Segment {
  kind: SegmentKind
  /** Fraction of the window, 0–1. */
  start: number
  width: number
  label: string
}

const DAY_START = 8 * 60
const DAY_END = 22 * 60

const KIND: Record<PlaceKind, SegmentKind> = {
  attraction: 'sight',
  museum: 'sight',
  viewpoint: 'sight',
  park: 'nature',
  national_park: 'nature',
  restaurant: 'food',
  cafe: 'food',
  market: 'food',
}

/**
 * A day as proportional blocks across 8:00–22:00 (stretched when a day runs
 * longer): one block per stop, plus the travel leading into it.
 */
export function daySegments(day: ItineraryDay): Segment[] {
  if (day.stops.length === 0) return []
  const first = Math.min(...day.stops.map((s) => s.startMin - (s.travelFromPrevMin ?? 0)))
  const last = Math.max(...day.stops.map((s) => s.startMin + s.durationMin))
  const from = Math.min(DAY_START, first)
  const to = Math.max(DAY_END, last)
  const span = to - from
  const frac = (min: number) => (min - from) / span

  const out: Segment[] = []
  for (const s of day.stops) {
    const travel = s.travelFromPrevMin ?? 0
    if (travel > 0) {
      out.push({
        kind: 'travel',
        start: frac(s.startMin - travel),
        width: travel / span,
        label: `Travel, about ${travel} min`,
      })
    }
    out.push({
      kind: KIND[s.place.kind] ?? 'sight',
      start: frac(s.startMin),
      width: s.durationMin / span,
      label: s.place.name,
    })
  }
  return out
}

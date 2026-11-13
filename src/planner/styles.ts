import type { Place, StyleId } from '../types'

/** A plan style: the same city, a different way of spending the days. */
export interface PlanStyle {
  id: StyleId
  title: string
  tagline: string
  sightsPerDay: number
  dayStart: string // "HH:MM"
  dayEnd: string // "HH:MM" — sightseeing ends by, dinner starts by
  sightStayMin: number
  mealMin: number
  /** Adds a market / bakery / bar stop before dinner. */
  extraFoodStop: boolean
  /** Added to a sight's notability score when choosing candidates. */
  sightWeight: (p: Place) => number
}

export const STYLES: Record<StyleId, PlanStyle> = {
  highlights: {
    id: 'highlights',
    title: 'Highlights',
    tagline: 'The famous sights, efficiently routed',
    sightsPerDay: 5,
    dayStart: '09:00',
    dayEnd: '21:30',
    sightStayMin: 95,
    mealMin: 80,
    extraFoodStop: false,
    sightWeight: () => 0,
  },
  food: {
    id: 'food',
    title: 'Food & local life',
    tagline: 'Long meals, markets and neighbourhood corners',
    sightsPerDay: 3,
    dayStart: '10:00',
    dayEnd: '22:00',
    sightStayMin: 90,
    mealMin: 105,
    extraFoodStop: true,
    // Lift neighbourhood spots that aren't headline, guidebook sights.
    sightWeight: (p) => (p.kind === 'attraction' && !p.wikipedia ? 2 : 0),
  },
  easy: {
    id: 'easy',
    title: 'Easy pace',
    tagline: 'Fewer stops, longer stays, more green',
    sightsPerDay: 3,
    dayStart: '10:00',
    dayEnd: '20:00',
    sightStayMin: 120,
    mealMin: 90,
    extraFoodStop: false,
    sightWeight: (p) =>
      p.kind === 'park' || p.kind === 'museum' || p.kind === 'viewpoint' ? 3 : 0,
  },
}

export const STYLE_ORDER: StyleId[] = ['highlights', 'food', 'easy']

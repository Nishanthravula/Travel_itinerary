import type { Destination, TripRequest } from './types'
import { TRANSPORT } from './planner/transport'
import { formatRange } from './components/SearchBar/dateRange'

/** "3 h 10 min", "45 min" */
export function formatDuration(min: number): string {
  const m = Math.round(min)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`
}

/** "4.6 (12,304 reviews)" */
export function formatRating(rating: number, count?: number): string {
  const stars = rating.toFixed(1)
  if (!count) return stars
  return `${stars} (${count.toLocaleString('en-US')} review${count === 1 ? '' : 's'})`
}

export function formatKm(km: number): string {
  if (km < 0.1) return 'under 100 m'
  if (km < 1) return `${Math.round(km * 10) * 100} m`
  return `${km.toFixed(km < 10 ? 1 : 0)} km`
}

export const placeTitle = (d: Destination): string =>
  [d.name, d.country].filter(Boolean).join(', ')

export const requestLine = (r: TripRequest): string =>
  `${formatRange(r.startDate, r.endDate)}, ${r.travellers === 1 ? '1 person' : `${r.travellers} people`}, ${TRANSPORT[r.transport].label.toLowerCase()}`

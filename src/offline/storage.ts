import type { Itinerary } from '../types'

const KEY = 'wayfarer.trips.v1'

/**
 * Saved trips live in localStorage so an itinerary opened at the
 * destination works with zero connectivity (paired with cached map tiles).
 */
export function loadTrips(): Itinerary[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Itinerary[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveTrip(trip: Itinerary): Itinerary[] {
  const trips = loadTrips().filter((t) => t.id !== trip.id)
  trips.unshift(trip)
  const capped = trips.slice(0, 20)
  localStorage.setItem(KEY, JSON.stringify(capped))
  return capped
}

export function deleteTrip(id: string): Itinerary[] {
  const trips = loadTrips().filter((t) => t.id !== id)
  localStorage.setItem(KEY, JSON.stringify(trips))
  return trips
}

import type { ItineraryStop, LegacyItinerary, Trip, TripRequest } from '../types'
import { addDaysISO } from '../types'

const KEY = 'wayfarer.trips.v2'
const LEGACY_KEY = 'wayfarer.trips.v1'
const MAX_TRIPS = 20

/**
 * Saved trips live in localStorage so a plan opened at the destination
 * reads with zero connectivity.
 */
export function loadTrips(): Trip[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Trip[]
      return Array.isArray(parsed) ? parsed.filter((t) => Array.isArray(t?.options)) : []
    }
    // First run of v2: carry over anything saved by the previous version.
    const legacyRaw = localStorage.getItem(LEGACY_KEY)
    if (!legacyRaw) return []
    const legacy = JSON.parse(legacyRaw) as LegacyItinerary[]
    const migrated = Array.isArray(legacy) ? legacy.map(migrateLegacy) : []
    write(migrated)
    return migrated
  } catch {
    return []
  }
}

export function saveTrip(trip: Trip): Trip[] {
  const trips = [trip, ...loadTrips().filter((t) => t.id !== trip.id)].slice(0, MAX_TRIPS)
  return write(trips)
}

export function deleteTrip(id: string): Trip[] {
  return write(loadTrips().filter((t) => t.id !== id))
}

/** The saved trip for exactly this request, if there is one. */
export function findSaved(trips: Trip[], r: Partial<TripRequest>): Trip | undefined {
  const norm = (s?: string) => s?.trim().toLowerCase() ?? ''
  const spot = (p?: { lat: number; lon: number }) =>
    p ? `${p.lat.toFixed(2)},${p.lon.toFixed(2)}` : ''
  return trips.find(
    (t) =>
      norm(t.request.destinationQuery) === norm(r.destinationQuery) &&
      t.request.startDate === r.startDate &&
      t.request.endDate === r.endDate &&
      t.request.travellers === r.travellers &&
      t.request.transport === r.transport &&
      (!r.near || spot(r.near) === spot(t.request.near ?? t.destination)),
  )
}

/** Persist, making room by dropping the oldest trip if storage is full. */
function write(trips: Trip[]): Trip[] {
  let current = trips
  for (;;) {
    try {
      localStorage.setItem(KEY, JSON.stringify(current))
      return current
    } catch {
      if (current.length <= 1) return current // can't persist; keep it in memory
      current = current.slice(0, -1)
    }
  }
}

const isSight = (s: ItineraryStop) => !['restaurant', 'cafe', 'market'].includes(s.place.kind)

/** Wrap a v1 single-plan itinerary as a trip with one option. */
export function migrateLegacy(i: LegacyItinerary): Trip {
  const stops = i.days.flatMap((d) => d.stops)
  const sights = stops.filter(isSight)
  return {
    id: i.id,
    createdAt: i.createdAt,
    request: {
      destinationQuery: i.request.destinationQuery,
      startDate: i.request.startDate,
      endDate: addDaysISO(i.request.startDate, Math.max(i.request.days, 1) - 1),
      days: i.request.days,
      travellers: 2,
      transport: 'transit',
      flights: i.request.flights ?? {},
    },
    destination: i.destination,
    cityInfo: i.cityInfo,
    options: [
      {
        style: 'highlights',
        title: 'Highlights',
        tagline: 'Saved with an earlier version of Wayfarer',
        days: i.days,
        base: { lat: i.destination.lat, lon: i.destination.lon },
        stays: [],
        summary: {
          sightCount: sights.length,
          travelMin: 0,
          indoorShare: sights.length ? sights.filter((s) => s.place.indoor).length / sights.length : 0,
          headlineSights: [...sights]
            .sort((a, b) => b.place.score - a.place.score)
            .slice(0, 3)
            .map((s) => s.place.name),
          baseLabel: `Central ${i.destination.name}`,
        },
      },
    ],
    parks: i.parks ?? [],
    forecastPartial: i.forecastPartial,
  }
}

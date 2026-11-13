import type { ItineraryStop, PlanOption, TransportMode } from '../types'

const BASE = 'https://www.google.com/maps/embed/v1'
/** The Maps Embed API accepts at most this many waypoints. */
const MAX_WAYPOINTS = 20

const point = (s: ItineraryStop) =>
  s.place.placeId ? `place_id:${s.place.placeId}` : `${s.place.lat},${s.place.lon}`

/**
 * URL for Google's free embeddable map showing the active day as a route
 * through its stops (or a search for stays around the plan). Google's terms
 * require its place data to be shown on a Google map, so trips built from
 * Google data use this instead of the open map.
 */
export function embedUrl(
  option: PlanOption,
  activeDay: number | 'stay',
  transport: TransportMode,
  key: string,
): string {
  const center = `${option.base.lat},${option.base.lon}`
  const build = (mode: string, params: Record<string, string>) =>
    `${BASE}/${mode}?${new URLSearchParams({ key, ...params })}`

  if (activeDay === 'stay') return build('search', { q: 'hotels', center, zoom: '14' })

  const stops = option.days[activeDay]?.stops ?? []
  if (stops.length === 0) return build('view', { center, zoom: '12' })
  if (stops.length === 1) return build('place', { q: point(stops[0]), zoom: '15' })

  const middle = stops.slice(1, -1).slice(0, MAX_WAYPOINTS).map(point)
  return build('directions', {
    origin: point(stops[0]),
    destination: point(stops[stops.length - 1]),
    ...(middle.length > 0 ? { waypoints: middle.join('|') } : {}),
    // Transit directions cannot pass through waypoints, so a transit day is
    // drawn along roads; the plan's own times remain its estimates.
    mode: transport === 'walk' ? 'walking' : 'driving',
  })
}

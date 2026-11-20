import type { GeoPoint, TransportMode } from '../types'

const MODE: Record<TransportMode, string> = { walk: 'walking', transit: 'transit', car: 'driving' }

type End = GeoPoint & { placeId?: string; name?: string }

/**
 * A Google Maps directions link between two stops (a plain link — free,
 * no API key). With Google place ids the route opens on the exact places.
 */
export function directionsUrl(from: End, to: End, mode: TransportMode): string {
  const url = new URL('https://www.google.com/maps/dir/')
  url.searchParams.set('api', '1')
  url.searchParams.set('origin', from.placeId && from.name ? from.name : `${from.lat},${from.lon}`)
  url.searchParams.set('destination', to.placeId && to.name ? to.name : `${to.lat},${to.lon}`)
  if (from.placeId) url.searchParams.set('origin_place_id', from.placeId)
  if (to.placeId) url.searchParams.set('destination_place_id', to.placeId)
  url.searchParams.set('travelmode', MODE[mode])
  return url.toString()
}

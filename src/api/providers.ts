import type { Destination, PlacePool, TransportMode } from '../types'

/**
 * Where places and stays come from. The app ships with one implementation
 * (OpenStreetMap via Overpass, free and keyless). A paid provider with live
 * prices, photos or ratings plugs in here: return the same pool and fill
 * the optional `price` / `rating` / `photoUrl` fields on `Stay` — the UI
 * shows them only when present.
 */
export interface PlacesProvider {
  fetchPool(dest: Destination, mode: TransportMode, signal?: AbortSignal): Promise<PlacePool>
}

export type { PlacePool }

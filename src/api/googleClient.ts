import type { PlacePool } from '../types'
import { fetchJson } from './http'
import type { PlacesProvider } from './providers'

/**
 * Places from Google, through the site's own server function (which holds
 * the API key). Rejects when Google isn't configured or available — the
 * caller then falls back to the free OpenStreetMap source.
 */
export const googleProvider: PlacesProvider = {
  fetchPool(dest, mode, signal) {
    return fetchJson<PlacePool>('/.netlify/functions/places', {
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: dest.lat, lon: dest.lon, name: dest.name, mode }),
      },
      timeoutMs: 15_000,
      retries: 0, // each attempt costs searches; fall back instead
      signal,
      validate: (pool) => {
        if (pool?.source !== 'google' || !Array.isArray(pool.sights)) {
          throw new Error('Not a Google places response')
        }
      },
    })
  },
}

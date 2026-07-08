import type { GeoPoint } from '../types'

/** Must match TILE_CACHE in vite.config.ts — the service worker serves
 *  map tiles from this cache, and the downloader below fills it. */
const TILE_CACHE = 'osm-tiles-v1'

const SUBDOMAINS = ['a', 'b', 'c']
/** Zooms that make a city map useful offline: overview → street level. */
const OFFLINE_ZOOMS = [12, 13, 14, 15]
/** Half-size of the downloaded square around the city centre, km. */
const AREA_HALF_KM = 6
/** Safety cap so we stay a polite OSM tile-server citizen. */
const MAX_TILES = 400
const CONCURRENCY = 6

export interface DownloadProgress {
  done: number
  total: number
  failed: number
}

function lonToTileX(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** z)
}
function latToTileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z,
  )
}

function tileUrls(center: GeoPoint): string[] {
  // Convert the km box to degrees (lon degrees shrink with latitude).
  const dLat = AREA_HALF_KM / 111
  const dLon = AREA_HALF_KM / (111 * Math.max(Math.cos((center.lat * Math.PI) / 180), 0.2))

  const urls: string[] = []
  for (const z of OFFLINE_ZOOMS) {
    const x0 = lonToTileX(center.lon - dLon, z)
    const x1 = lonToTileX(center.lon + dLon, z)
    const y0 = latToTileY(center.lat + dLat, z)
    const y1 = latToTileY(center.lat - dLat, z)
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const sub = SUBDOMAINS[(x + y) % SUBDOMAINS.length]
        urls.push(`https://${sub}.tile.openstreetmap.org/${z}/${x}/${y}.png`)
      }
    }
  }
  return urls.slice(0, MAX_TILES)
}

export function isOfflineMapsSupported(): boolean {
  return typeof caches !== 'undefined'
}

/**
 * Prefetch the map tiles for the destination area into the same cache the
 * service worker serves from, so the map keeps working with no signal.
 */
export async function downloadOfflineArea(
  center: GeoPoint,
  onProgress: (p: DownloadProgress) => void,
): Promise<DownloadProgress> {
  const cache = await caches.open(TILE_CACHE)
  const urls = tileUrls(center)
  const progress: DownloadProgress = { done: 0, total: urls.length, failed: 0 }

  const queue = [...urls]
  const worker = async () => {
    for (;;) {
      const url = queue.shift()
      if (!url) return
      try {
        const hit = await cache.match(url)
        if (!hit) {
          const res = await fetch(url, { mode: 'cors' })
          if (res.ok) await cache.put(url, res)
          else progress.failed++
        }
      } catch {
        progress.failed++
      }
      progress.done++
      onProgress({ ...progress })
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  return progress
}

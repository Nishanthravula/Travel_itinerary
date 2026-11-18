import type { Destination, Place, PlaceKind, Stay, TransportMode } from '../types'
import { haversineKm } from '../types'
import { TRANSPORT } from '../planner/transport'
import { fetchJson } from './http'

/**
 * Notable places from Wikipedia's geographic search: free, keyless, fast and
 * browser-friendly. Used when the OpenStreetMap servers cannot supply
 * sights (the main public one has turned away browser traffic since 2026).
 * Wikipedia has landmarks, museums, parks and famous hotels — not
 * restaurants — so food still comes from OpenStreetMap or Google.
 */

/** Wikipedia's geosearch radius limit, km. */
const MAX_KM = 10

interface WikiPage {
  pageid?: number
  title?: string
  description?: string
  length?: number
  coordinates?: Array<{ lat?: number; lon?: number }>
}

export function wikipediaGeoUrl(dest: Destination, mode: TransportMode): string {
  const km = Math.min(TRANSPORT[mode].radiusKm, MAX_KM)
  const url = new URL('https://en.wikipedia.org/w/api.php')
  url.search = new URLSearchParams({
    action: 'query',
    generator: 'geosearch',
    ggscoord: `${dest.lat}|${dest.lon}`,
    ggsradius: String(Math.round(km * 1000)),
    ggslimit: '500',
    prop: 'coordinates|description|info',
    colimit: 'max',
    format: 'json',
    formatversion: '2',
    origin: '*',
  }).toString()
  return url.toString()
}

// Checked in order. Descriptions are Wikidata's short English descriptions,
// e.g. "Art museum in New York City", "Urban park in Manhattan".
const SKIP =
  /\b(station|stop|school|college|university|neighbou?rhood|street|avenue|road|highway|boulevard|district|borough|county|village|hamlet|suburb|census|company|corporation|hospital|apartment|residential|office|former|demolished|defunct|parish|electoral|constituency|post office|police|fire station|cemetery|airport|terminal|line\b|route\b|tunnel|interchange|church of)\b/i
const STAY = /\b(hotel|hostel|inn|resort)\b/i
const PARK = /\b(park|garden|gardens|arboretum|beach|nature reserve|forest)\b/i
const MUSEUM = /\b(museum|gallery|exhibition|planetarium)\b/i
const VIEW = /\b(observation|lookout|viewpoint|scenic|overlook)\b/i
const SIGHT =
  /\b(monument|memorial|statue|sculpture|bridge|cathedral|basilica|church|mosque|synagogue|temple|shrine|abbey|monastery|tower|castle|palace|fort|fortress|square|plaza|landmark|theat(?:er|re)|opera|concert hall|zoo|aquarium|botanical|skyscraper|market|stadium|library|historic|heritage|lighthouse|pier|fountain|attraction|amusement|ruins|arena|building|mansion|house museum|gate|wall)\b/i

function classify(description: string): PlaceKind | 'stay' | null {
  if (STAY.test(description)) return 'stay'
  if (SKIP.test(description)) return null
  if (MUSEUM.test(description)) return 'museum'
  if (VIEW.test(description)) return 'viewpoint'
  if (PARK.test(description)) return 'park'
  if (SIGHT.test(description)) return 'attraction'
  return null
}

/** Article length is a fair proxy for how notable a place is. */
const score = (length = 0) => Math.max(1, Math.log10(Math.max(length, 1)) * 3 - 6)

export function parseWikipediaGeo(
  data: unknown,
  dest: Destination,
): { sights: Place[]; parks: Place[]; stays: Stay[] } {
  const raw = (data as { query?: { pages?: WikiPage[] | Record<string, WikiPage> } })?.query?.pages
  const pages = Array.isArray(raw) ? raw : Object.values(raw ?? {})
  const sights: Place[] = []
  const parks: Place[] = []
  const stays: Stay[] = []

  for (const p of pages) {
    const lat = p.coordinates?.[0]?.lat
    const lon = p.coordinates?.[0]?.lon
    if (!p.title || !p.description || lat == null || lon == null) continue
    const kind = classify(p.description)
    if (!kind) continue
    const shared = {
      id: `wikipedia/${p.pageid ?? p.title}`,
      name: p.title,
      lat,
      lon,
      score: score(p.length),
      website: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`,
    }
    if (kind === 'stay') {
      stays.push({ ...shared, type: 'hotel' })
      continue
    }
    const place: Place = {
      ...shared,
      kind,
      indoor: kind === 'museum',
      wikipedia: `en:${p.title}`,
      distanceKm: haversineKm({ lat, lon }, dest),
    }
    ;(kind === 'park' ? parks : sights).push(place)
  }

  const byScore = <T extends { score: number }>(a: T, b: T) => b.score - a.score
  return { sights: sights.sort(byScore), parks: parks.sort(byScore), stays: stays.sort(byScore) }
}

export async function fetchWikipediaPlaces(
  dest: Destination,
  mode: TransportMode,
  signal?: AbortSignal,
): Promise<{ sights: Place[]; parks: Place[]; stays: Stay[] }> {
  const data = await fetchJson<unknown>(wikipediaGeoUrl(dest, mode), {
    timeoutMs: 12_000,
    retries: 1,
    signal,
  })
  return parseWikipediaGeo(data, dest)
}

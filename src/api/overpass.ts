import type {
  Destination,
  Place,
  PlaceKind,
  PlacePool,
  Stay,
  StayType,
  TransportMode,
} from '../types'
import { haversineKm } from '../types'
import { TRANSPORT } from '../planner/transport'
import { HttpError, fetchJson } from './http'
import type { PlacesProvider } from './providers'

/** Public Overpass instances, tried in order. All are shared, free services. */
export const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

/** Food and stays are only useful near where the days are spent, km. */
const FOOD_RADIUS_KM = 10
const STAY_RADIUS_KM = 12
/** National/state parks and nature reserves are listed from this far, km. */
const PARKS_RADIUS_KM = 80

export interface OverpassElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

const SIGHT_TOURISM = /^(attraction|museum|gallery|viewpoint|zoo|aquarium|theme_park|artwork)$/
const SIGHT_HISTORIC =
  /^(castle|monument|memorial|fort|ruins|archaeological_site|palace|city_gate|tower)$/
const STAY_TOURISM = /^(hotel|guest_house|hostel|apartment)$/
const INDOOR_KINDS = new Set<PlaceKind>(['museum'])

export function buildQuery(dest: Destination, mode: TransportMode): string {
  const at = (km: number) => `(around:${Math.round(km * 1000)},${dest.lat},${dest.lon})`
  const radius = TRANSPORT[mode].radiusKm
  const sights = at(radius)
  const food = at(Math.min(radius, FOOD_RADIUS_KM))
  const stays = at(Math.min(radius, STAY_RADIUS_KM))
  const wide = at(PARKS_RADIUS_KM)
  // Well-known sights (those with a Wikidata entry) are fetched first and in
  // full, so a busy city's landmarks are never crowded out by the size cap.
  return `
[out:json][timeout:40];
(
  nwr["tourism"~"${SIGHT_TOURISM.source}"]["name"]["wikidata"]${sights};
  nwr["historic"~"${SIGHT_HISTORIC.source}"]["name"]["wikidata"]${sights};
);
out center 400;
(
  nwr["tourism"~"^(attraction|museum|gallery|viewpoint|zoo|aquarium|theme_park)$"]["name"][!"wikidata"]${sights};
  nwr["historic"~"${SIGHT_HISTORIC.source}"]["name"][!"wikidata"]${sights};
);
out center 150;
nwr["amenity"="restaurant"]["name"]["cuisine"]${food};
out center 400;
nwr["amenity"="cafe"]["name"]${food};
out center 120;
(
  nwr["amenity"="marketplace"]["name"]${food};
  nwr["amenity"~"^(bar|pub)$"]["name"]${food};
  nwr["shop"="bakery"]["name"]${food};
);
out center 120;
nwr["tourism"~"${STAY_TOURISM.source}"]["name"]${stays};
out center 250;
(
  nwr["leisure"~"^(park|garden)$"]["name"]${sights};
  nwr["boundary"="national_park"]["name"]${wide};
  nwr["leisure"="nature_reserve"]["name"]${wide};
  nwr["boundary"="protected_area"]["protect_class"~"^(2|5)$"]["name"]${wide};
);
out center 120;
`
}

function classify(tags: Record<string, string>): PlaceKind | null {
  if (tags.boundary === 'national_park' || tags.boundary === 'protected_area')
    return 'national_park'
  if (tags.leisure === 'nature_reserve') return 'national_park'
  if (tags.leisure === 'park' || tags.leisure === 'garden') return 'park'
  if (tags.amenity === 'restaurant') return 'restaurant'
  if (tags.amenity === 'cafe') return 'cafe'
  if (tags.amenity === 'marketplace' || tags.amenity === 'bar' || tags.amenity === 'pub')
    return 'market'
  if (tags.shop === 'bakery') return 'market'
  if (tags.tourism === 'museum' || tags.tourism === 'gallery') return 'museum'
  if (tags.tourism === 'viewpoint') return 'viewpoint'
  if (tags.tourism && SIGHT_TOURISM.test(tags.tourism)) return 'attraction'
  if (tags.historic && SIGHT_HISTORIC.test(tags.historic)) return 'attraction'
  return null
}

/**
 * Notability score from OSM tags. Wikipedia/Wikidata presence is the
 * strongest signal a place is genuinely famous rather than incidental.
 */
function scorePlace(tags: Record<string, string>, kind: PlaceKind): number {
  let s = 0
  if (tags.wikipedia) s += 5
  if (tags.wikidata) s += 4
  if (tags.heritage) s += 3
  if (tags['heritage:operator']) s += 1
  if (tags.website || tags['contact:website']) s += 1
  if (tags.wheelchair === 'yes') s += 0.5
  if (kind === 'restaurant') {
    if (tags.cuisine && !/burger|pizza|fast_food|sandwich|chicken/.test(tags.cuisine)) s += 2
    if (tags['diet:vegetarian'] === 'yes') s += 0.5
    if (tags.brand) s -= 3 // chains are not "authentic local"
  }
  if ((kind === 'cafe' || kind === 'market') && tags.brand) s -= 3
  if (tags.opening_hours) s += 0.5
  return s
}

const displayName = (tags: Record<string, string>) => tags['name:en'] || tags.name
/**
 * OSM `website` tags are free text typed by anyone: often a bare domain,
 * sometimes not a web address at all. Only http(s) links are kept.
 */
export function safeUrl(raw: string | undefined): string | undefined {
  const text = raw?.trim().split(/[;\s]/)[0]
  if (!text) return undefined
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`
  try {
    const url = new URL(candidate)
    const isWeb = url.protocol === 'http:' || url.protocol === 'https:'
    return isWeb && url.hostname.includes('.') ? url.toString() : undefined
  } catch {
    return undefined
  }
}

const websiteOf = (tags: Record<string, string>) =>
  safeUrl(tags.website) ?? safeUrl(tags['contact:website'])

function position(el: OverpassElement): { lat: number; lon: number } | null {
  const lat = el.lat ?? el.center?.lat
  const lon = el.lon ?? el.center?.lon
  return lat == null || lon == null ? null : { lat, lon }
}

function toStay(el: OverpassElement): Stay | null {
  const tags = el.tags ?? {}
  const name = displayName(tags)
  const pos = position(el)
  if (!name || !pos || !tags.tourism || !STAY_TOURISM.test(tags.tourism)) return null
  const stars = Number.parseFloat(tags.stars ?? '')
  const hasStars = Number.isFinite(stars) && stars > 0 && stars <= 5
  const website = websiteOf(tags)
  let score = 0
  if (tags.wikidata) score += 3
  if (website) score += 1
  if (hasStars) score += stars
  if (tags.internet_access && tags.internet_access !== 'no') score += 0.5
  return {
    id: `${el.type}/${el.id}`,
    name,
    type: tags.tourism as StayType,
    ...pos,
    stars: hasStars ? stars : undefined,
    website,
    parking: tags.parking === undefined ? undefined : tags.parking !== 'no',
    score,
  }
}

function toPlace(el: OverpassElement, dest: Destination): Place | null {
  const tags = el.tags ?? {}
  const name = displayName(tags)
  const pos = position(el)
  if (!name || !pos) return null
  const kind = classify(tags)
  if (!kind) return null
  return {
    id: `${el.type}/${el.id}`,
    name,
    kind,
    ...pos,
    score: scorePlace(tags, kind),
    indoor: INDOOR_KINDS.has(kind) || tags.indoor === 'yes',
    cuisine: tags.cuisine?.split(';')[0]?.replace(/_/g, ' '),
    openingHours: tags.opening_hours,
    website: websiteOf(tags),
    wikipedia: tags.wikipedia,
    distanceKm: haversineKm(pos, dest),
  }
}

/** Turn raw Overpass elements into a ranked, de-duplicated pool. Pure. */
export function parseOverpass(elements: OverpassElement[], dest: Destination): PlacePool {
  const seen = new Set<string>()
  const fresh = (key: string) => {
    if (seen.has(key)) return false // ways+relations often duplicate nodes
    seen.add(key)
    return true
  }

  const places: Place[] = []
  const stays: Stay[] = []
  for (const el of elements) {
    const stay = toStay(el)
    if (stay) {
      if (fresh(`stay:${stay.name.toLowerCase()}`)) stays.push(stay)
      continue
    }
    const p = toPlace(el, dest)
    if (p && fresh(`${p.kind}:${p.name.toLowerCase()}`)) places.push(p)
  }

  const byScore = (a: Place, b: Place) => b.score - a.score || a.distanceKm - b.distanceKm
  const of = (...kinds: PlaceKind[]) => places.filter((p) => kinds.includes(p.kind)).sort(byScore)

  return {
    sights: of('attraction', 'museum', 'viewpoint'),
    restaurants: of('restaurant'),
    cafes: of('cafe'),
    markets: of('market'),
    parks: of('park').filter((p) => p.score > 0),
    nationalParks: of('national_park'),
    stays: stays.sort((a, b) => b.score - a.score),
  }
}

/** Places and stays from OpenStreetMap via Overpass (free, keyless). */
export const overpassProvider: PlacesProvider = {
  async fetchPool(dest, mode, signal) {
    const data = await fetchJson<{ elements?: OverpassElement[]; remark?: string }>(OVERPASS_MIRRORS, {
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(buildQuery(dest, mode))}`,
      },
      timeoutMs: 50_000,
      retries: OVERPASS_MIRRORS.length - 1,
      signal,
      // Overpass reports its own timeout as a 200 with partial results.
      // A partial city must not be planned from, or cached.
      validate: (d) => {
        if (d.remark && /timed out|runtime error|out of memory/i.test(d.remark)) {
          throw new HttpError('timeout', 'The places service ran out of time')
        }
      },
    })
    return parseOverpass(data.elements ?? [], dest)
  },
}

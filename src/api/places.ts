import type { Destination, Place, PlaceKind } from '../types'
import { haversineKm } from '../types'

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter'

/** Radius for in-city sights and food, km. */
const CITY_RADIUS_KM = 12
/** Radius for national/state parks and nature reserves, km. */
const PARKS_RADIUS_KM = 80

interface OverpassElement {
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
const INDOOR_KINDS = new Set<PlaceKind>(['museum'])

function buildQuery(dest: Destination): string {
  const around = `(around:${CITY_RADIUS_KM * 1000},${dest.lat},${dest.lon})`
  const aroundWide = `(around:${PARKS_RADIUS_KM * 1000},${dest.lat},${dest.lon})`
  return `
[out:json][timeout:60];
(
  nwr["tourism"~"${SIGHT_TOURISM.source}"]["name"]${around};
  nwr["historic"~"${SIGHT_HISTORIC.source}"]["name"]${around};
)->.sights;
.sights out center 200;
nwr["amenity"="restaurant"]["name"]["cuisine"]${around}->.food;
.food out center 150;
nwr["amenity"="cafe"]["name"]${around}->.cafes;
.cafes out center 100;
(
  nwr["leisure"~"^(park|garden)$"]["name"]${around};
  nwr["boundary"="national_park"]["name"]${aroundWide};
  nwr["leisure"="nature_reserve"]["name"]${aroundWide};
  nwr["boundary"="protected_area"]["protect_class"~"^(2|5)$"]["name"]${aroundWide};
)->.parks;
.parks out center 120;
`
}

function classify(tags: Record<string, string>): PlaceKind | null {
  if (tags.boundary === 'national_park' || tags.boundary === 'protected_area')
    return 'national_park'
  if (tags.leisure === 'nature_reserve') return 'national_park'
  if (tags.leisure === 'park' || tags.leisure === 'garden') return 'park'
  if (tags.amenity === 'restaurant') return 'restaurant'
  if (tags.amenity === 'cafe') return 'cafe'
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
  if (kind === 'cafe' && tags.brand) s -= 3
  if (tags.opening_hours) s += 0.5
  return s
}

function toPlace(el: OverpassElement, dest: Destination): Place | null {
  const tags = el.tags ?? {}
  const name = tags.name
  if (!name) return null
  const lat = el.lat ?? el.center?.lat
  const lon = el.lon ?? el.center?.lon
  if (lat == null || lon == null) return null
  const kind = classify(tags)
  if (!kind) return null
  return {
    id: `${el.type}/${el.id}`,
    name,
    kind,
    lat,
    lon,
    score: scorePlace(tags, kind),
    indoor: INDOOR_KINDS.has(kind) || tags.indoor === 'yes',
    cuisine: tags.cuisine?.split(';')[0]?.replace(/_/g, ' '),
    openingHours: tags.opening_hours,
    website: tags.website ?? tags['contact:website'],
    wikipedia: tags.wikipedia,
    distanceKm: haversineKm({ lat, lon }, dest),
  }
}

export interface PlacePool {
  sights: Place[]
  restaurants: Place[]
  cafes: Place[]
  parks: Place[]
  nationalParks: Place[]
}

/**
 * Fetch and rank points of interest around the destination from
 * OpenStreetMap via Overpass (free, keyless, CORS-enabled).
 */
export async function fetchPlaces(dest: Destination): Promise<PlacePool> {
  const res = await fetch(OVERPASS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(buildQuery(dest))}`,
  })
  if (!res.ok) throw new Error(`Places lookup failed (HTTP ${res.status})`)
  const data = (await res.json()) as { elements?: OverpassElement[] }

  const seen = new Set<string>()
  const all: Place[] = []
  for (const el of data.elements ?? []) {
    const p = toPlace(el, dest)
    if (!p) continue
    const key = `${p.kind}:${p.name.toLowerCase()}`
    if (seen.has(key)) continue // ways+relations often duplicate nodes
    seen.add(key)
    all.push(p)
  }

  const byScore = (a: Place, b: Place) =>
    b.score - a.score || a.distanceKm - b.distanceKm

  const pool: PlacePool = {
    sights: all
      .filter((p) => ['attraction', 'museum', 'viewpoint'].includes(p.kind))
      .sort(byScore),
    restaurants: all.filter((p) => p.kind === 'restaurant').sort(byScore),
    cafes: all.filter((p) => p.kind === 'cafe').sort(byScore),
    parks: all
      .filter((p) => p.kind === 'park' && p.score > 0)
      .sort(byScore),
    nationalParks: all.filter((p) => p.kind === 'national_park').sort(byScore),
  }
  return pool
}

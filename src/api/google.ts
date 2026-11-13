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
import { safeUrl } from './overpass'

/**
 * Google Places as a source of places. Pure request-building and parsing,
 * shared by the server function (which holds the key and makes the calls)
 * and its tests. Nothing here talks to the network.
 *
 * Each plan costs a fixed number of searches (see `googleSearches`). All
 * requested fields sit in Google's "Enterprise" billing tier, which has a
 * free monthly allowance; the allowance and a hard cap are managed in the
 * Google Cloud console, not here.
 */

export type GooglePart = 'sights' | 'parks' | 'restaurants' | 'cafes' | 'markets' | 'stays'

export interface GoogleSearch {
  part: GooglePart
  body: {
    includedTypes: string[]
    maxResultCount: number
    rankPreference: 'POPULARITY'
    languageCode: 'en'
    locationRestriction: {
      circle: { center: { latitude: number; longitude: number }; radius: number }
    }
  }
}

export interface GooglePlace {
  id?: string
  displayName?: { text?: string }
  location?: { latitude?: number; longitude?: number }
  primaryType?: string
  types?: string[]
  rating?: number
  userRatingCount?: number
  websiteUri?: string
  googleMapsUri?: string
  priceLevel?: string
  businessStatus?: string
}

export const SEARCH_URL = 'https://places.googleapis.com/v1/places:searchNearby'

/** Only what the app shows. No reviews or photos (a dearer billing tier). */
export const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.location',
  'places.primaryType',
  'places.types',
  'places.rating',
  'places.userRatingCount',
  'places.websiteUri',
  'places.googleMapsUri',
  'places.priceLevel',
  'places.businessStatus',
].join(',')

/** Google returns at most 20 places per search. */
const PAGE = 20
const CORE_KM = 3
const FOOD_KM = 8
const STAY_KM = 12
const LOCAL_KM = 12

/**
 * The nine searches behind one plan. A search returns only the 20 most
 * popular matches, so sights and restaurants are asked for twice — the
 * centre and the wider area — to gather enough for several days.
 */
export function googleSearches(dest: Destination, mode: TransportMode): GoogleSearch[] {
  const reach = TRANSPORT[mode].radiusKm
  const search = (part: GooglePart, includedTypes: string[], km: number): GoogleSearch => ({
    part,
    body: {
      includedTypes,
      maxResultCount: PAGE,
      rankPreference: 'POPULARITY',
      languageCode: 'en',
      locationRestriction: {
        circle: {
          center: { latitude: dest.lat, longitude: dest.lon },
          radius: Math.round(Math.min(km, reach) * 1000),
        },
      },
    },
  })
  return [
    search('sights', ['tourist_attraction'], CORE_KM),
    search('sights', ['tourist_attraction'], reach),
    search('sights', ['museum', 'art_gallery'], LOCAL_KM),
    search('parks', ['park'], LOCAL_KM),
    search('restaurants', ['restaurant'], CORE_KM),
    search('restaurants', ['restaurant'], FOOD_KM),
    search('cafes', ['cafe'], FOOD_KM),
    search('markets', ['bar', 'bakery'], FOOD_KM),
    search('stays', ['lodging'], STAY_KM),
  ]
}

const PRICE: Record<string, string> = {
  PRICE_LEVEL_INEXPENSIVE: '$',
  PRICE_LEVEL_MODERATE: '$$',
  PRICE_LEVEL_EXPENSIVE: '$$$',
  PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
}

/**
 * Notability from rating and how many people gave it: a 4.6 from 50,000
 * reviews should outrank a 4.9 from a dozen. Lands on roughly the same
 * 0–17 scale as the OpenStreetMap scores the planner was tuned on.
 */
function score(p: GooglePlace): number {
  const rating = p.rating ?? 3.5
  const count = p.userRatingCount ?? 0
  return (rating - 3) * 3 + Math.log10(count + 1) * 2.5
}

const hasType = (p: GooglePlace, ...types: string[]) =>
  types.some((t) => p.primaryType === t || p.types?.includes(t))

function sightKind(p: GooglePlace): PlaceKind {
  if (hasType(p, 'museum', 'art_gallery')) return 'museum'
  if (hasType(p, 'park', 'national_park', 'garden', 'botanical_garden')) return 'park'
  if (hasType(p, 'observation_deck', 'scenic_spot')) return 'viewpoint'
  return 'attraction'
}

function stayType(p: GooglePlace): StayType {
  if (hasType(p, 'hostel')) return 'hostel'
  if (hasType(p, 'guest_house', 'bed_and_breakfast', 'inn')) return 'guest_house'
  if (hasType(p, 'private_guest_room', 'cottage')) return 'apartment'
  return 'hotel'
}

/** "italian_restaurant" → "italian"; plain "restaurant" → nothing. */
const cuisineOf = (p: GooglePlace) =>
  p.primaryType?.endsWith('_restaurant')
    ? p.primaryType.slice(0, -'_restaurant'.length).replace(/_/g, ' ')
    : undefined

const KIND: Record<Exclude<GooglePart, 'stays'>, (p: GooglePlace) => PlaceKind> = {
  sights: sightKind,
  parks: () => 'park',
  restaurants: () => 'restaurant',
  cafes: () => 'cafe',
  markets: () => 'market',
}

const POOL_PART: Record<GooglePart, NonNullable<PlacePool['missing']>[number]> = {
  sights: 'sights',
  parks: 'parks',
  restaurants: 'food',
  cafes: 'food',
  markets: 'food',
  stays: 'stays',
}

/** Turn Google's answers into a ranked, de-duplicated pool. Pure. */
export function parseGoogle(
  answers: Array<{ part: GooglePart; places: GooglePlace[] }>,
  dest: Destination,
  failed: GooglePart[] = [],
): PlacePool {
  const seen = new Set<string>()
  const places: Place[] = []
  const stays: Stay[] = []

  for (const { part, places: found } of answers) {
    for (const p of found) {
      const name = p.displayName?.text
      const lat = p.location?.latitude
      const lon = p.location?.longitude
      if (!p.id || !name || lat == null || lon == null) continue
      if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') continue
      if (seen.has(p.id)) continue
      seen.add(p.id)

      const shared = {
        id: `google/${p.id}`,
        placeId: p.id,
        name,
        lat,
        lon,
        score: score(p),
        website: safeUrl(p.websiteUri),
        mapsUrl: safeUrl(p.googleMapsUri),
        rating: p.rating,
        ratingCount: p.userRatingCount,
        priceLevel: p.priceLevel ? PRICE[p.priceLevel] : undefined,
      }
      if (part === 'stays') {
        stays.push({ ...shared, type: stayType(p) })
      } else {
        const kind = KIND[part](p)
        places.push({
          ...shared,
          kind,
          indoor: kind === 'museum',
          cuisine: part === 'restaurants' ? cuisineOf(p) : undefined,
          distanceKm: haversineKm({ lat, lon }, dest),
        })
      }
    }
  }

  const byScore = (a: Place, b: Place) => b.score - a.score || a.distanceKm - b.distanceKm
  const of = (...kinds: PlaceKind[]) => places.filter((p) => kinds.includes(p.kind)).sort(byScore)

  return {
    sights: of('attraction', 'museum', 'viewpoint'),
    restaurants: of('restaurant'),
    cafes: of('cafe'),
    markets: of('market'),
    parks: of('park'),
    nationalParks: [],
    stays: stays.sort((a, b) => b.score - a.score),
    missing: [...new Set(failed.map((part) => POOL_PART[part]))],
    source: 'google',
  }
}

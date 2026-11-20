import type { Photo, Place, PlanOption, Trip } from '../types'
import { haversineKm } from '../types'
import { fetchJson } from './http'

/**
 * Free photos for sights and parks, from the lead image of the place's
 * Wikipedia article. Restaurants, cafés and stays are never looked up:
 * their names too often match an unrelated article, and there is no free
 * photo source for them.
 */

const API = 'https://en.wikipedia.org/w/api.php'
/** Titles per request, Wikipedia's limit for normal clients. */
const BATCH = 50
/** An article further than this from the place is about something else. */
const MATCH_KM = 3
const THUMB_PX = 480
const PHOTO_KINDS = new Set(['attraction', 'museum', 'viewpoint', 'park', 'national_park'])

export function photoLookupUrl(titles: string[]): string {
  const url = new URL(API)
  url.search = new URLSearchParams({
    action: 'query',
    titles: titles.join('|'),
    prop: 'pageimages|coordinates',
    piprop: 'thumbnail',
    pithumbsize: String(THUMB_PX),
    pilimit: 'max',
    colimit: 'max',
    redirects: '1',
    format: 'json',
    formatversion: '2',
    origin: '*',
  }).toString()
  return url.toString()
}

/** The places worth a photo lookup: sights and parks, one per name. */
export function photoCandidates(places: Place[]): Place[] {
  const seen = new Set<string>()
  return places.filter((p) => {
    if (!PHOTO_KINDS.has(p.kind) || seen.has(p.name)) return false
    seen.add(p.name)
    return true
  })
}

const articleUrl = (title: string) =>
  `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`

interface WikiPhotoPage {
  title?: string
  missing?: boolean
  thumbnail?: { source?: string }
  coordinates?: Array<{ lat?: number; lon?: number }>
}

/**
 * Match Wikipedia's answer back to places. A photo is only used when the
 * article sits within 3 km of the place — "Alma" the Lisbon restaurant is
 * not "Alma" the town in Quebec. Returns photos keyed by place id.
 */
export function parsePhotos(data: unknown, places: Place[]): Map<string, Photo> {
  const q = (data as {
    query?: {
      normalized?: Array<{ from: string; to: string }>
      redirects?: Array<{ from: string; to: string }>
      pages?: WikiPhotoPage[]
    }
  } | null)?.query
  const result = new Map<string, Photo>()
  if (!q?.pages) return result

  const step = (list: Array<{ from: string; to: string }> | undefined) =>
    new Map((list ?? []).map((x) => [x.from, x.to]))
  const normalized = step(q.normalized)
  const redirects = step(q.redirects)
  const finalTitle = (name: string) => {
    const n = normalized.get(name) ?? name
    return redirects.get(n) ?? n
  }
  const pages = new Map(q.pages.filter((pg) => pg.title && !pg.missing).map((pg) => [pg.title!, pg]))

  for (const place of places) {
    const title = finalTitle(place.name)
    const page = pages.get(title)
    const url = page?.thumbnail?.source
    const at = page?.coordinates?.[0]
    if (!url || at?.lat == null || at.lon == null) continue
    if (!url.startsWith('https://upload.wikimedia.org/')) continue
    if (haversineKm({ lat: at.lat, lon: at.lon }, place) > MATCH_KM) continue
    result.set(place.id, { url, pageUrl: articleUrl(title) })
  }
  return result
}

/** Look up photos for these places. Best-effort: never throws. */
export async function fetchPhotos(places: Place[], signal?: AbortSignal): Promise<Map<string, Photo>> {
  const wanted = photoCandidates(places)
  const batches: Place[][] = []
  for (let i = 0; i < wanted.length; i += BATCH) batches.push(wanted.slice(i, i + BATCH))

  const found = new Map<string, Photo>()
  const answers = await Promise.allSettled(
    batches.map((batch) =>
      fetchJson<unknown>(photoLookupUrl(batch.map((p) => p.name)), {
        timeoutMs: 8000,
        retries: 0,
        signal,
      }),
    ),
  )
  answers.forEach((a) => {
    if (a.status !== 'fulfilled') return
    // A place shares its photo with every same-named copy (other options).
    for (const [id, photo] of parsePhotos(a.value, places)) found.set(id, photo)
  })
  return found
}

/** Every distinct place in the trip's plans. */
export function tripPlaces(trip: Trip): Place[] {
  const byId = new Map<string, Place>()
  for (const o of trip.options) for (const d of o.days) for (const s of d.stops) byId.set(s.place.id, s.place)
  return [...byId.values()]
}

/** A copy of the trip with photos set on matching places. Pure. */
export function attachPhotos(trip: Trip, photos: Map<string, Photo>): Trip {
  if (photos.size === 0) return trip
  const withPhoto = (o: PlanOption): PlanOption => ({
    ...o,
    days: o.days.map((d) => ({
      ...d,
      stops: d.stops.map((s) => {
        const photo = photos.get(s.place.id)
        return photo ? { ...s, place: { ...s.place, photo } } : s
      }),
    })),
  })
  return { ...trip, options: trip.options.map(withPhoto) }
}

interface SummaryImages {
  thumbnail?: { source?: string; width?: number; height?: number }
  originalimage?: { source?: string; width?: number; height?: number }
}

const HERO_PX = 1280

/**
 * A banner-sized rendition of a Wikipedia summary's image. Wikimedia serves
 * any width of a large image by rewriting the "NNNpx-" part of a thumbnail
 * URL; a small original is used as is.
 */
export function heroImageUrl(summary: SummaryImages): string | undefined {
  const original = summary.originalimage
  const thumb = summary.thumbnail
  const ok = (u?: string) => u?.startsWith('https://upload.wikimedia.org/')
  if (original?.source && ok(original.source) && (original.width ?? 0) <= HERO_PX + 320) {
    return original.source
  }
  if (thumb?.source && ok(thumb.source) && /\/\d+px-[^/]+$/.test(thumb.source)) {
    return thumb.source.replace(/\/\d+px-([^/]+)$/, `/${HERO_PX}px-$1`)
  }
  return undefined
}


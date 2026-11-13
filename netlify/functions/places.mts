import type { Context } from '@netlify/functions'
import type { Destination, TransportMode } from '../../src/types'
import {
  FIELD_MASK,
  SEARCH_URL,
  googleSearches,
  parseGoogle,
  type GooglePart,
  type GooglePlace,
} from '../../src/api/google'

/**
 * Places from Google, for the app's planner.
 *
 * The browser sends a position and a transport mode; this function runs the
 * searches with the secret key and returns one merged pool. It serves at
 * /.netlify/functions/places.
 *
 * - No key configured → 501, and the app uses its free OpenStreetMap source.
 * - Google gives no sights (quota used up, key rejected, outage) → 503, same
 *   fallback. Monthly cost is capped in the Google Cloud console by setting
 *   a quota on the Places API, not in this code.
 * - The response is never cached: Google's terms do not allow storing it.
 */

const MODES: TransportMode[] = ['walk', 'transit', 'car']
const TIMEOUT_MS = 8000

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

export default async (req: Request, _context?: Context): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)

  const key = Netlify.env.get('GOOGLE_PLACES_API_KEY')
  if (!key) return json({ error: 'Google Places is not configured' }, 501)

  let input: { lat?: unknown; lon?: unknown; name?: unknown; mode?: unknown }
  try {
    input = await req.json()
  } catch {
    return json({ error: 'Body must be JSON' }, 400)
  }
  const { lat, lon, mode } = input
  if (
    typeof lat !== 'number' || typeof lon !== 'number' ||
    !Number.isFinite(lat) || !Number.isFinite(lon) ||
    Math.abs(lat) > 90 || Math.abs(lon) > 180 ||
    !MODES.includes(mode as TransportMode)
  ) {
    return json({ error: 'Expected { lat, lon, mode }' }, 400)
  }
  const dest: Destination = {
    name: typeof input.name === 'string' ? input.name.slice(0, 80) : '',
    lat,
    lon,
    country: '',
    countryCode: '',
    timezone: 'UTC',
  }

  const searches = googleSearches(dest, mode as TransportMode)
  const results = await Promise.allSettled(
    searches.map(async (s) => {
      const res = await fetch(SEARCH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': FIELD_MASK,
        },
        body: JSON.stringify(s.body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!res.ok) throw new Error(`Google answered ${res.status}`)
      const data = (await res.json()) as { places?: GooglePlace[] }
      return { part: s.part, places: data.places ?? [] }
    }),
  )

  const answers = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
  const answered = new Set(answers.map((a) => a.part))
  const failed = [...new Set(searches.map((s) => s.part))].filter(
    (part): part is GooglePart => !answered.has(part),
  )
  results.forEach((r, i) => {
    if (r.status === 'rejected') console.error(`places: ${searches[i].part} search failed:`, String(r.reason))
  })

  const pool = parseGoogle(answers, dest, failed)
  if (pool.sights.length === 0) return json({ error: 'Google returned no sights' }, 503)
  return json(pool, 200)
}

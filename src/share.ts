import type { Destination, GeoPoint, TransportMode, TripRequest } from './types'
import { addDaysISO, daysBetweenInclusive, haversineKm } from './types'

export const MAX_DAYS = 14
export const MAX_TRAVELLERS = 12
export const DEFAULT_TRAVELLERS = 2
export const DEFAULT_TRANSPORT: TransportMode = 'transit'

const MODES: TransportMode[] = ['walk', 'transit', 'car']

/** The parts of a request worth sharing — flight times stay private. */
export function requestToParams(r: TripRequest): URLSearchParams {
  const params = new URLSearchParams({
    q: r.destinationQuery,
    from: r.startDate,
    to: r.endDate,
    n: String(r.travellers),
    by: r.transport,
  })
  if (r.near) params.set('at', `${r.near.lat.toFixed(3)},${r.near.lon.toFixed(3)}`)
  return params
}

/** A hint further than this from every match is ignored, km. */
const NEAR_KM = 100

/**
 * Pick the place a request means from the geocoder's matches: the one
 * nearest the request's position hint, otherwise the first (largest).
 */
export function chooseDestination(found: Destination[], near?: GeoPoint): Destination | undefined {
  if (!near) return found[0]
  const close = found
    .map((d) => ({ d, km: haversineKm(d, near) }))
    .filter((x) => x.km <= NEAR_KM)
    .sort((a, b) => a.km - b.km)[0]
  return close?.d ?? found[0]
}

function parseNear(raw: string | null): GeoPoint | undefined {
  if (!raw || !/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(raw)) return undefined
  const [lat, lon] = raw.split(',').map(Number)
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : undefined
}

const isISODate = (s: string | null): s is string => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const t = Date.parse(`${s}T00:00:00Z`)
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s
}

/**
 * Read a request back from a URL. Links get edited, go stale and get
 * mangled, so every field is repaired to something valid; `runnable` is
 * true only when the link could be used exactly as written — otherwise the
 * form is prefilled and the traveller presses the button themselves.
 */
export function paramsToRequest(
  p: URLSearchParams,
  todayISO: string,
): { request: Partial<TripRequest>; runnable: boolean } {
  const request: Partial<TripRequest> = { flights: {} }
  let exact = true

  const q = p.get('q')?.trim()
  if (q) request.destinationQuery = q
  else exact = false

  const near = parseNear(p.get('at'))
  if (near) request.near = near

  const rawN = p.get('n')
  const n = Number(rawN ?? DEFAULT_TRAVELLERS)
  const validN = Number.isInteger(n) && n >= 1 && n <= MAX_TRAVELLERS
  request.travellers = validN ? n : Number.isInteger(n) && n > MAX_TRAVELLERS ? MAX_TRAVELLERS : DEFAULT_TRAVELLERS
  if (!validN) exact = false

  const by = p.get('by') as TransportMode | null
  const validBy = by === null || MODES.includes(by)
  request.transport = by && validBy ? by : DEFAULT_TRANSPORT
  if (!validBy) exact = false

  const from = p.get('from')
  const to = p.get('to')
  if (isISODate(from) && isISODate(to)) {
    let start = from
    let end = to
    if (end < start) {
      end = start
      exact = false
    }
    if (start < todayISO) {
      const length = daysBetweenInclusive(start, end)
      start = todayISO
      end = addDaysISO(start, length - 1)
      exact = false
    }
    if (daysBetweenInclusive(start, end) > MAX_DAYS) {
      end = addDaysISO(start, MAX_DAYS - 1)
      exact = false
    }
    request.startDate = start
    request.endDate = end
    request.days = daysBetweenInclusive(start, end)
  } else {
    exact = false
  }

  return { request, runnable: exact }
}

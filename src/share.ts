import type { TransportMode, TripRequest } from './types'
import { addDaysISO, daysBetweenInclusive } from './types'

export const MAX_DAYS = 14
export const MAX_TRAVELLERS = 12
export const DEFAULT_TRAVELLERS = 2
export const DEFAULT_TRANSPORT: TransportMode = 'transit'

const MODES: TransportMode[] = ['walk', 'transit', 'car']

/** The parts of a request worth sharing — flight times stay private. */
export function requestToParams(r: TripRequest): URLSearchParams {
  return new URLSearchParams({
    q: r.destinationQuery,
    from: r.startDate,
    to: r.endDate,
    n: String(r.travellers),
    by: r.transport,
  })
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

  const n = Number(p.get('n') ?? DEFAULT_TRAVELLERS)
  request.travellers =
    !Number.isInteger(n) || n < 1 ? DEFAULT_TRAVELLERS : Math.min(n, MAX_TRAVELLERS)

  const by = p.get('by') as TransportMode | null
  request.transport = by && MODES.includes(by) ? by : DEFAULT_TRANSPORT

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

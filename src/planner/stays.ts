import type { GeoPoint, RankedStay, Stay, TripRequest } from '../types'
import { addDaysISO, haversineKm } from '../types'

const MAX_STAYS = 4
/** Cap per stay type while other types are available, so options vary. */
const MAX_PER_TYPE = 2
/** Ranking points lost per km from the plan's base. */
const DISTANCE_PENALTY_PER_KM = 1.5

/** Rooms to search for: two people per room. */
export const roomsFor = (travellers: number): number => Math.max(1, Math.ceil(travellers / 2))

/**
 * A booking-site search prefilled with the trip's dates, guests and rooms.
 * We never show prices ourselves — this is where the traveller checks them.
 * The one place to change if the target site changes.
 */
export function bookingUrl(query: string, request: TripRequest): string {
  const checkout =
    request.days > 1 && request.endDate > request.startDate
      ? request.endDate
      : addDaysISO(request.startDate, 1)
  const url = new URL('https://www.booking.com/searchresults.html')
  url.searchParams.set('ss', query)
  url.searchParams.set('checkin', request.startDate)
  url.searchParams.set('checkout', checkout)
  url.searchParams.set('group_adults', String(request.travellers))
  url.searchParams.set('no_rooms', String(roomsFor(request.travellers)))
  url.searchParams.set('group_children', '0')
  return url.toString()
}

/** City-wide search — the fallback when no individual stays are mapped. */
export const citySearchUrl = (cityName: string, request: TripRequest): string =>
  bookingUrl(cityName, request)

/**
 * Pick up to four stays for a plan: close to where its days are spent,
 * better-documented first, with a nudge for what suits the party
 * (apartments or 4★+ for four or more, parking for car trips).
 */
export function rankStays(
  stays: Stay[],
  base: GeoPoint,
  request: TripRequest,
  cityName: string,
): RankedStay[] {
  const scored = stays
    .map((stay) => {
      const distanceFromBaseKm = haversineKm(stay, base)
      let rank = stay.score - DISTANCE_PENALTY_PER_KM * distanceFromBaseKm
      if (request.travellers >= 4 && (stay.type === 'apartment' || (stay.stars ?? 0) >= 4)) rank += 2
      if (request.transport === 'car' && stay.parking) rank += 1.5
      return { stay, distanceFromBaseKm, rank }
    })
    .sort((a, b) => b.rank - a.rank)

  const picked: typeof scored = []
  const held: typeof scored = []
  const perType = new Map<string, number>()
  for (const s of scored) {
    if (picked.length === MAX_STAYS) break
    const n = perType.get(s.stay.type) ?? 0
    if (n >= MAX_PER_TYPE) {
      held.push(s)
      continue
    }
    perType.set(s.stay.type, n + 1)
    picked.push(s)
  }
  // Not enough variety to fill the list: top up with the best of the rest.
  for (const s of held) {
    if (picked.length === MAX_STAYS) break
    picked.push(s)
  }
  picked.sort((a, b) => b.rank - a.rank)

  return picked.map(({ stay, distanceFromBaseKm }) => ({
    ...stay,
    distanceFromBaseKm,
    bookingUrl: bookingUrl(`${stay.name}, ${cityName}`, request),
  }))
}

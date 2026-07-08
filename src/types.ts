/** Core domain types shared across API, planner and UI layers. */

export interface GeoPoint {
  lat: number
  lon: number
}

export interface Destination extends GeoPoint {
  name: string
  country: string
  countryCode: string
  admin1?: string
  timezone: string
  population?: number
}

export type PlaceKind =
  | 'attraction'
  | 'museum'
  | 'viewpoint'
  | 'restaurant'
  | 'cafe'
  | 'park'
  | 'national_park'

export interface Place extends GeoPoint {
  id: string
  name: string
  kind: PlaceKind
  /** Higher = more notable. Derived from OSM tags (wikipedia/wikidata/heritage…). */
  score: number
  indoor: boolean
  cuisine?: string
  openingHours?: string
  website?: string
  wikipedia?: string
  distanceKm: number
}

export interface DayWeather {
  date: string // ISO yyyy-mm-dd, destination-local
  code: number // WMO weather code
  tMax: number
  tMin: number
  precipProbability: number // 0-100
  windMax: number
  sunrise: string // "HH:MM"
  sunset: string // "HH:MM"
}

export interface FlightDetails {
  arrivalTime?: string // "HH:MM" destination-local, on day 1
  arrivalFlight?: string
  departureTime?: string // "HH:MM" destination-local, on last day
  departureFlight?: string
}

export interface TripRequest {
  destinationQuery: string
  startDate: string // ISO yyyy-mm-dd
  days: number
  flights: FlightDetails
}

export interface ItineraryStop {
  place: Place
  /** Suggested arrival, minutes since local midnight. */
  startMin: number
  /** Suggested time to spend, minutes. */
  durationMin: number
  /** Why this slot (e.g. "sunset views", "indoor — rain expected"). */
  note?: string
}

export interface ItineraryDay {
  date: string
  label: string // "Day 1"
  weather?: DayWeather
  stops: ItineraryStop[]
  /** Free-form notes: arrival buffer, departure cut-off, weather advice. */
  notes: string[]
}

export interface CityInfo {
  summary?: string
  wikipediaUrl?: string
  currency?: string
  languages?: string
  drivingSide?: string
  timezone: string
}

export interface Itinerary {
  id: string
  createdAt: string
  request: TripRequest
  destination: Destination
  cityInfo: CityInfo
  days: ItineraryDay[]
  /** Notable parks/reserves worth a detour, incl. beyond the city radius. */
  parks: Place[]
  /** True if the trip dates are beyond the reliable forecast horizon. */
  forecastPartial: boolean
}

export const minutesToHHMM = (min: number): string => {
  const m = ((min % 1440) + 1440) % 1440
  const h = Math.floor(m / 60)
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export const hhmmToMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

export const addDaysISO = (isoDate: string, days: number): string => {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export const haversineKm = (a: GeoPoint, b: GeoPoint): number => {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

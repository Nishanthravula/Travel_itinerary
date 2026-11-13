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
  | 'market'

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

export type TransportMode = 'walk' | 'transit' | 'car'
export type StyleId = 'highlights' | 'food' | 'easy'
export type StayType = 'hotel' | 'guest_house' | 'hostel' | 'apartment'

export interface TripRequest {
  destinationQuery: string
  startDate: string // ISO yyyy-mm-dd, first day
  endDate: string // ISO yyyy-mm-dd, last day (inclusive)
  days: number // derived: inclusive day count, 1–14
  travellers: number // 1–12
  transport: TransportMode
  flights: FlightDetails
  /** The exact place meant, when several share the name ("Paris", Texas). */
  near?: GeoPoint
}

/** Request shape saved by v1 of the app; kept for migration only. */
export interface LegacyTripRequest {
  destinationQuery: string
  startDate: string
  days: number
  flights: FlightDetails
}

/** A place to stay. Optional price/rating/photo are only ever filled by a
 *  provider that genuinely has them — the open-data provider never does. */
export interface Stay extends GeoPoint {
  id: string
  name: string
  type: StayType
  stars?: number
  website?: string
  parking?: boolean
  score: number
  price?: string
  rating?: number
  photoUrl?: string
}

export interface RankedStay extends Stay {
  distanceFromBaseKm: number
  bookingUrl: string
}

/** Everything fetched for a destination, before any planning. */
export interface PlacePool {
  sights: Place[]
  restaurants: Place[]
  cafes: Place[]
  markets: Place[]
  parks: Place[]
  nationalParks: Place[]
  stays: Stay[]
}

export interface ItineraryStop {
  place: Place
  /** Suggested arrival, minutes since local midnight. */
  startMin: number
  /** Suggested time to spend, minutes. */
  durationMin: number
  /** Why this slot (e.g. "sunset views", "indoor — rain expected"). */
  note?: string
  /** Estimated minutes to get here from the previous stop. */
  travelFromPrevMin?: number
  /** How that leg is covered — short hops are walked whatever the trip's mode. */
  travelBy?: TransportMode
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

export interface OptionSummary {
  sightCount: number
  /** Total estimated minutes spent moving between stops, whole trip. */
  travelMin: number
  /** Share of sights that are indoor, 0–1. */
  indoorShare: number
  headlineSights: string[]
  baseLabel: string
}

/** One complete way to spend the trip. */
export interface PlanOption {
  style: StyleId
  title: string
  tagline: string
  days: ItineraryDay[]
  /** Where this plan's stops centre — stays are ranked around it. */
  base: GeoPoint
  stays: RankedStay[]
  summary: OptionSummary
}

export interface Trip {
  id: string
  createdAt: string
  request: TripRequest
  destination: Destination
  cityInfo: CityInfo
  options: PlanOption[]
  /** Notable parks/reserves worth a detour, incl. beyond the city radius. */
  parks: Place[]
  /** True if the trip dates are beyond the reliable forecast horizon. */
  forecastPartial: boolean
  /** Shown above the options, e.g. when fewer than three could be built. */
  notice?: string
}

/** Single-plan trip saved by v1 of the app; kept for migration only. */
export interface LegacyItinerary {
  id: string
  createdAt: string
  request: LegacyTripRequest
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

/** The calendar date where the traveller is (not the UTC date). */
export const localISODate = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Inclusive number of days from start to end (same day → 1). */
export const daysBetweenInclusive = (startISO: string, endISO: string): number => {
  const ms = Date.parse(`${endISO}T00:00:00Z`) - Date.parse(`${startISO}T00:00:00Z`)
  return Math.round(ms / 86_400_000) + 1
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

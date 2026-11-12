import type { GeoPoint, TransportMode } from '../types'
import { haversineKm } from '../types'

export interface TransportProfile {
  /** How far from the centre we look for sights, km. */
  radiusKm: number
  /** Assumed door-to-door speed, km/h. */
  speedKmh: number
  /** Multiplier turning straight-line distance into travelled distance. */
  detour: number
  /** Fixed minutes per hop: waiting for transit, parking a car. */
  overheadMin: number
  /** Whether nearby parks/nature are offered as day stops. */
  includeNature: boolean
  label: string
  /** Used after a duration: "≈ 12 min walk". */
  verb: string
}

export const TRANSPORT: Record<TransportMode, TransportProfile> = {
  walk: {
    radiusKm: 5, speedKmh: 4.5, detour: 1.3, overheadMin: 0, includeNature: false,
    label: 'Walking', verb: 'walk',
  },
  transit: {
    radiusKm: 12, speedKmh: 16, detour: 1.4, overheadMin: 8, includeNature: false,
    label: 'Transit', verb: 'by transit',
  },
  car: {
    radiusKm: 30, speedKmh: 28, detour: 1.4, overheadMin: 10, includeNature: true,
    label: 'Car', verb: 'drive',
  },
}

/** Below this the two stops are effectively the same place. */
const SAME_PLACE_KM = 0.05

const minutesBy = (km: number, mode: TransportMode): number => {
  const p = TRANSPORT[mode]
  return p.overheadMin + Math.round(((km * p.detour) / p.speedKmh) * 60)
}

/**
 * How a traveller gets from a to b and roughly how long it takes. With
 * transit or a car, a hop that is quicker on foot is walked — nobody waits
 * for a tram to go 400 m. An estimate from straight-line distance, not
 * routing, so the UI always shows it with "≈".
 */
export function hopBetween(
  a: GeoPoint,
  b: GeoPoint,
  mode: TransportMode,
): { minutes: number; by: TransportMode } {
  const km = haversineKm(a, b)
  if (km < SAME_PLACE_KM) return { minutes: 0, by: 'walk' }
  const chosen = minutesBy(km, mode)
  const onFoot = minutesBy(km, 'walk')
  return onFoot <= chosen ? { minutes: onFoot, by: 'walk' } : { minutes: chosen, by: mode }
}

/** Estimated minutes from a to b for a trip using `mode`. */
export function hopMinutes(a: GeoPoint, b: GeoPoint, mode: TransportMode): number {
  return hopBetween(a, b, mode).minutes
}

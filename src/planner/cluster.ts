import type { GeoPoint, Place } from '../types'
import { haversineKm } from '../types'

/**
 * Deterministic, balanced k-means over place coordinates.
 *
 * Each cluster becomes one day of the trip, so we want groups that are
 * geographically tight (less criss-crossing the city). Initialisation uses
 * farthest-point sampling from the top-scored place, so results are stable
 * run-to-run — no RNG.
 *
 * `targets` (optional) sets the wanted cluster sizes — e.g. a flight-trimmed
 * arrival day only fits 2 sights, so its cluster should hold 2, not n/k.
 * The multiset of resulting sizes matches `targets`; without it, sizes are
 * near-equal as before. Members are only ever moved between clusters, never
 * dropped.
 */
export function clusterPlaces(
  places: Place[],
  k: number,
  targets?: number[],
): Place[][] {
  if (k <= 0) return []
  if (places.length === 0) return Array.from({ length: k }, () => [])
  if (k === 1) return [[...places]]

  const kEff = Math.min(k, places.length)

  // Farthest-point initial centroids.
  const centroids: GeoPoint[] = [{ lat: places[0].lat, lon: places[0].lon }]
  while (centroids.length < kEff) {
    let best: Place = places[0]
    let bestDist = -1
    for (const p of places) {
      const d = Math.min(...centroids.map((c) => haversineKm(p, c)))
      if (d > bestDist) {
        bestDist = d
        best = p
      }
    }
    centroids.push({ lat: best.lat, lon: best.lon })
  }

  let assignment = new Array<number>(places.length).fill(0)
  for (let iter = 0; iter < 25; iter++) {
    const next = places.map((p) => nearestIndex(p, centroids))
    if (next.every((v, i) => v === assignment[i]) && iter > 0) break
    assignment = next
    for (let c = 0; c < kEff; c++) {
      const members = places.filter((_, i) => assignment[i] === c)
      if (members.length === 0) continue
      centroids[c] = {
        lat: members.reduce((s, p) => s + p.lat, 0) / members.length,
        lon: members.reduce((s, p) => s + p.lon, 0) / members.length,
      }
    }
  }

  const clusters: Place[][] = Array.from({ length: kEff }, () => [])
  places.forEach((p, i) => clusters[assignment[i]].push(p))

  balance(clusters, centroids, capsFor(clusters, places.length, targets))

  // Pad with empty clusters if k > number of places.
  while (clusters.length < k) clusters.push([])
  return clusters
}

/**
 * Per-cluster size caps. With explicit targets, the largest target goes to
 * the currently-largest cluster (least disruption); caps are inflated if
 * they can't hold everything. Without targets, near-equal sizes.
 */
function capsFor(clusters: Place[][], n: number, targets?: number[]): number[] {
  const k = clusters.length
  if (!targets) return new Array<number>(k).fill(Math.ceil(n / k) + 1)

  const sorted = [...targets].sort((a, b) => b - a).slice(0, k)
  while (sorted.length < k) sorted.push(0)
  let deficit = n - sorted.reduce((s, t) => s + t, 0)
  for (let i = 0; deficit > 0; i = (i + 1) % k) {
    sorted[i]++
    deficit--
  }

  const bySize = clusters
    .map((c, i) => ({ i, size: c.length }))
    .sort((a, b) => b.size - a.size)
  const caps = new Array<number>(k).fill(0)
  bySize.forEach(({ i }, rank) => {
    caps[i] = sorted[rank]
  })
  return caps
}

function nearestIndex(p: GeoPoint, centroids: GeoPoint[]): number {
  let idx = 0
  let best = Infinity
  centroids.forEach((c, i) => {
    const d = haversineKm(p, c)
    if (d < best) {
      best = d
      idx = i
    }
  })
  return idx
}

/** Move outliers from over-cap clusters into the nearest one with room. */
function balance(clusters: Place[][], centroids: GeoPoint[], caps: number[]): void {
  for (let c = 0; c < clusters.length; c++) {
    while (clusters[c].length > caps[c]) {
      // Evict the member farthest from its own centroid.
      let evictIdx = 0
      let worst = -1
      clusters[c].forEach((p, i) => {
        const d = haversineKm(p, centroids[c])
        if (d > worst) {
          worst = d
          evictIdx = i
        }
      })
      const [evicted] = clusters[c].splice(evictIdx, 1)

      let dest = -1
      let bestDist = Infinity
      clusters.forEach((cl, i) => {
        if (i === c || cl.length >= caps[i]) return
        const d = haversineKm(evicted, centroids[i])
        if (d < bestDist) {
          bestDist = d
          dest = i
        }
      })
      if (dest === -1) {
        clusters[c].push(evicted) // nowhere to put it; keep and stop
        break
      }
      clusters[dest].push(evicted)
    }
  }
}

/** Order stops as a short walking route: nearest-neighbour from `start`. */
export function orderByRoute(places: Place[], start: GeoPoint): Place[] {
  const remaining = [...places]
  const route: Place[] = []
  let cursor: GeoPoint = start
  while (remaining.length > 0) {
    let idx = 0
    let best = Infinity
    remaining.forEach((p, i) => {
      const d = haversineKm(p, cursor)
      if (d < best) {
        best = d
        idx = i
      }
    })
    const [next] = remaining.splice(idx, 1)
    route.push(next)
    cursor = next
  }
  return route
}

export function centroidOf(places: GeoPoint[]): GeoPoint | null {
  if (places.length === 0) return null
  return {
    lat: places.reduce((s, p) => s + p.lat, 0) / places.length,
    lon: places.reduce((s, p) => s + p.lon, 0) / places.length,
  }
}

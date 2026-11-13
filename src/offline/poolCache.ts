import type { GeoPoint, PlacePool, TransportMode } from '../types'

/**
 * Remembers the places fetched for a destination so planning the same city
 * again (new dates, more people) doesn't hit the shared Overpass service.
 * IndexedDB because a pool is too large for localStorage. Entirely
 * best-effort: any failure just means a fresh fetch.
 */

const DB = 'wayfarer'
const STORE = 'pools'
const TTL_MS = 7 * 24 * 60 * 60 * 1000

interface Entry {
  savedAt: number
  pool: PlacePool
}

export const poolKey = (at: GeoPoint, mode: TransportMode): string =>
  `${at.lat.toFixed(3)},${at.lon.toFixed(3)}:${mode}`

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function run<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const req = op(tx.objectStore(STORE))
        tx.oncomplete = () => {
          db.close()
          resolve(req.result)
        }
        tx.onerror = tx.onabort = () => {
          db.close()
          reject(tx.error)
        }
      }),
  )
}

export async function getCachedPool(key: string): Promise<PlacePool | null> {
  try {
    const entry = await run<Entry | undefined>('readonly', (s) => s.get(key))
    if (!entry || Date.now() - entry.savedAt > TTL_MS) return null
    return entry.pool
  } catch {
    return null
  }
}

export async function putCachedPool(key: string, pool: PlacePool): Promise<void> {
  try {
    await run('readwrite', (s) => s.put({ savedAt: Date.now(), pool } satisfies Entry, key))
  } catch {
    // private mode, quota, old browser — caching is optional
  }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Destination, Trip, TripRequest } from './types'
import { searchDestinations } from './api/geocode'
import { HttpError, isAbort } from './api/http'
import { overpassProvider } from './api/overpass'
import { fetchCityInfo } from './api/cityInfo'
import { fetchTripWeather } from './api/weather'
import { getCachedPool, poolKey, putCachedPool } from './offline/poolCache'
import { deleteTrip, loadTrips, saveTrip } from './offline/storage'
import { buildTrip } from './planner/planner'
import { chooseDestination, requestToParams } from './share'

export type PlanState =
  | { phase: 'idle' }
  | { phase: 'loading'; step: string }
  | { phase: 'error'; message: string; retry: () => void }
  | { phase: 'ready'; trip: Trip; alternatives: Destination[] }

const sameSpot = (a: Destination, b: Destination) =>
  Math.abs(a.lat - b.lat) < 0.01 && Math.abs(a.lon - b.lon) < 0.01

function explain(err: unknown, query: string): string {
  if (!navigator.onLine) {
    return "You're offline. Saved trips still open; a new plan needs a connection."
  }
  if (err instanceof HttpError) {
    return err.kind === 'timeout'
      ? 'The places service took too long to answer. It is shared and sometimes busy — try again in a moment.'
      : 'The places service is busy or unreachable right now. Try again in a moment.'
  }
  if (err instanceof Error && err.message) return err.message
  return `Something went wrong planning ${query}. Try again.`
}

/** Runs a plan from request to saved trip, and owns the saved-trip list. */
export function usePlanTrip() {
  const [state, setState] = useState<PlanState>({ phase: 'idle' })
  const [trips, setTrips] = useState<Trip[]>(() => loadTrips())
  const inFlight = useRef<AbortController | null>(null)

  useEffect(() => () => inFlight.current?.abort(), [])

  const showInUrl = (request: TripRequest | null) => {
    const qs = request ? `?${requestToParams(request)}` : ''
    history.replaceState(null, '', `${location.pathname}${qs}`)
  }

  const plan = useCallback(async (original: TripRequest, picked?: Destination) => {
    let request = original
    inFlight.current?.abort()
    const ctrl = new AbortController()
    inFlight.current = ctrl
    const { signal } = ctrl

    try {
      setState({ phase: 'loading', step: `Finding ${request.destinationQuery}` })
      let destination = picked
      let alternatives: Destination[] = []
      if (!destination) {
        const found = await searchDestinations(request.destinationQuery, signal)
        if (found.length === 0) {
          throw new Error(
            `No place called "${request.destinationQuery}" was found. Check the spelling, or try the nearest larger town.`,
          )
        }
        destination = chooseDestination(found, request.near)!
        const chosen = destination
        alternatives = found.filter((d) => !sameSpot(d, chosen))
      }
      // Remember exactly which place this was, for share links and re-planning.
      request = { ...request, near: { lat: destination.lat, lon: destination.lon } }

      setState({
        phase: 'loading',
        step: `Gathering sights, food and stays in ${destination.name}`,
      })
      const key = poolKey(destination, request.transport)
      let fromCache = true
      const [pool, weatherByDate, cityInfo] = await Promise.all([
        getCachedPool(key).then((hit) => {
          if (hit) return hit
          fromCache = false
          return overpassProvider.fetchPool(destination, request.transport, signal)
        }),
        fetchTripWeather(destination, request.startDate, request.days, signal),
        fetchCityInfo(destination, signal),
      ])
      if (signal.aborted) return

      if (pool.sights.length === 0 && pool.parks.length === 0) {
        throw new Error(
          `There isn't enough mapped data around ${destination.name} to build a plan. Try the nearest larger town.`,
        )
      }
      // A hit must not renew its own expiry; an incomplete pool must not be kept.
      if (!fromCache && !pool.missing?.length) void putCachedPool(key, pool)

      setState({ phase: 'loading', step: 'Building your plans' })
      const trip = buildTrip({ request, destination, pool, weatherByDate, cityInfo })
      setTrips(saveTrip(trip))
      showInUrl(trip.request)
      setState({ phase: 'ready', trip, alternatives })
    } catch (err) {
      if (isAbort(err) || signal.aborted) return
      setState({
        phase: 'error',
        message: explain(err, request.destinationQuery),
        retry: () => void plan(original, picked),
      })
    }
  }, [])

  const open = useCallback((trip: Trip) => {
    inFlight.current?.abort()
    showInUrl(trip.request)
    setState({ phase: 'ready', trip, alternatives: [] })
  }, [])

  const remove = useCallback((id: string) => {
    setTrips(deleteTrip(id))
    setState((s) => (s.phase === 'ready' && s.trip.id === id ? { phase: 'idle' } : s))
  }, [])

  const reset = useCallback(() => {
    inFlight.current?.abort()
    showInUrl(null)
    setState({ phase: 'idle' })
  }, [])

  return { state, trips, plan, open, remove, reset }
}

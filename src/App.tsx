import { useEffect, useMemo, useState } from 'react'
import type { Destination, Trip, TripRequest } from './types'
import OptionCards from './components/OptionCards'
import PlanView from './components/PlanView'
import SavedDrawer from './components/SavedDrawer'
import SearchBar from './components/SearchBar/SearchBar'
import { placeLine } from './components/SearchBar/DestinationField'
import { todayISO } from './components/SearchBar/dateRange'
import Skeleton from './components/Skeleton'
import { placeTitle, requestLine } from './format'
import { paramsToRequest, requestToParams } from './share'
import { BookmarkIcon, LinkIcon } from './ui/icons'
import { usePlanTrip } from './usePlanTrip'

function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

export default function App() {
  const { state, trips, plan, open, remove, reset } = usePlanTrip()
  const online = useOnline()
  const fromUrl = useMemo(
    () => paramsToRequest(new URLSearchParams(location.search), todayISO()),
    [],
  )
  const [initial, setInitial] = useState<Partial<TripRequest>>(fromUrl.request)
  const [optionIndex, setOptionIndex] = useState<number | null>(null)
  const [drawer, setDrawer] = useState(false)
  const [toast, setToast] = useState('')

  // A complete, valid share link plans itself; anything else only prefills.
  useEffect(() => {
    if (fromUrl.runnable) void plan(fromUrl.request as TripRequest)
  }, [fromUrl, plan])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 2500)
    return () => clearTimeout(timer)
  }, [toast])

  const trip = state.phase === 'ready' ? state.trip : null
  const tripId = trip?.id
  useEffect(() => {
    setOptionIndex(null)
    window.scrollTo({ top: 0 })
  }, [tripId])

  const submit = (request: TripRequest, picked?: Destination) => void plan(request, picked)

  const openSaved = (t: Trip) => {
    setInitial({ ...t.request })
    open(t)
  }

  const copyLink = async (t: Trip) => {
    const url = `${location.origin}${location.pathname}?${requestToParams(t.request)}`
    try {
      await navigator.clipboard.writeText(url)
      setToast('Link copied')
    } catch {
      setToast('Copy the address from your browser to share this trip')
    }
  }

  const home = state.phase === 'idle'

  return (
    <div className={home ? 'app is-home' : 'app'}>
      <header className="top">
        <a
          className="brand"
          href={location.pathname}
          onClick={(e) => {
            e.preventDefault()
            setInitial({})
            reset()
          }}
        >
          Wayfarer
        </a>
        <div className="top-actions">
          {!online && <span className="pill">Offline</span>}
          <button
            className="text-button with-icon"
            data-testid="saved-open"
            onClick={() => setDrawer(true)}
          >
            <BookmarkIcon size={16} />
            Saved{trips.length > 0 ? ` (${trips.length})` : ''}
          </button>
        </div>
      </header>

      <main>
        {home && (
          <div className="hero">
            <h1>Where to next?</h1>
            <p className="lede">
              Say where, when, who and how. Get three complete plans to compare — sights, local
              food and places to stay, timed around the weather.
            </p>
          </div>
        )}

        <SearchBar initial={initial} busy={state.phase === 'loading'} onSubmit={submit} />

        {state.phase === 'loading' && <Skeleton step={state.step} />}

        {state.phase === 'error' && (
          <div className="notice notice-error" role="alert" data-testid="error-card">
            <p>{state.message}</p>
            <button className="button" onClick={state.retry}>
              Try again
            </button>
          </div>
        )}

        {state.phase === 'ready' && trip && (
          <section className="trip" aria-label={`Trip to ${trip.destination.name}`}>
            <header className="trip-head">
              <div>
                <h2 className="trip-title">{placeTitle(trip.destination)}</h2>
                <p className="trip-meta">{requestLine(trip.request)}</p>
              </div>
              <button className="button with-icon" onClick={() => void copyLink(trip)}>
                <LinkIcon size={16} />
                Copy link
              </button>
            </header>

            {state.alternatives.length > 0 && (
              <p className="notice">
                Showing {trip.destination.name}
                {placeLine(trip.destination) ? `, ${placeLine(trip.destination)}` : ''}. Did you
                mean{' '}
                {state.alternatives.slice(0, 3).map((d, i) => (
                  <span key={`${d.lat},${d.lon}`}>
                    {i > 0 && ', '}
                    <button className="link-button" onClick={() => void plan(trip.request, d)}>
                      {d.name}, {placeLine(d)}
                    </button>
                  </span>
                ))}
                ?
              </p>
            )}
            {trip.notice && <p className="notice">{trip.notice}</p>}
            {trip.forecastPartial && (
              <p className="notice">
                Forecasts only reach 16 days ahead. Plan again closer to the trip and the days will
                be arranged around the weather.
              </p>
            )}

            {optionIndex === null ? (
              <OptionCards trip={trip} onOpen={setOptionIndex} />
            ) : (
              <PlanView
                trip={trip}
                index={optionIndex}
                onSwitch={setOptionIndex}
                onBack={() => setOptionIndex(null)}
              />
            )}
          </section>
        )}
      </main>

      <footer className="foot">
        <p>
          Places and maps from{' '}
          <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors via{' '}
          <a href="https://openfreemap.org/">OpenFreeMap</a>. Weather by{' '}
          <a href="https://open-meteo.com/">Open-Meteo</a>. City summaries from Wikipedia. Travel
          times are estimates.
        </p>
      </footer>

      {drawer && (
        <SavedDrawer
          trips={trips}
          onOpen={openSaved}
          onDelete={remove}
          onClose={() => setDrawer(false)}
        />
      )}
      <div className="toast" role="status" aria-live="polite">
        {toast && <span>{toast}</span>}
      </div>
    </div>
  )
}

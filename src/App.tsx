import { useCallback, useEffect, useState } from 'react'
import type { Itinerary, TripRequest } from './types'
import { geocodeDestination } from './api/geocode'
import { fetchPlaces } from './api/places'
import { fetchTripWeather } from './api/weather'
import { fetchCityInfo } from './api/cityInfo'
import { buildItinerary } from './planner/planner'
import { loadTrips, saveTrip, deleteTrip } from './offline/storage'
import TripForm from './components/TripForm'
import ItineraryView from './components/ItineraryView'
import SavedTrips from './components/SavedTrips'

type Status =
  | { phase: 'idle' }
  | { phase: 'loading'; step: string }
  | { phase: 'error'; message: string }

export default function App() {
  const [status, setStatus] = useState<Status>({ phase: 'idle' })
  const [itinerary, setItinerary] = useState<Itinerary | null>(null)
  const [trips, setTrips] = useState<Itinerary[]>(() => loadTrips())
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

  const generate = useCallback(async (request: TripRequest) => {
    setItinerary(null)
    try {
      setStatus({ phase: 'loading', step: `Finding ${request.destinationQuery}…` })
      const destination = await geocodeDestination(request.destinationQuery)

      setStatus({
        phase: 'loading',
        step: `Gathering sights, food & weather for ${destination.name}…`,
      })
      const [pool, weatherByDate, cityInfo] = await Promise.all([
        fetchPlaces(destination),
        fetchTripWeather(destination, request.startDate, request.days),
        fetchCityInfo(destination),
      ])

      if (pool.sights.length === 0 && pool.parks.length === 0) {
        throw new Error(
          `Not enough map data found around "${destination.name}". Try the nearest larger city.`,
        )
      }

      setStatus({ phase: 'loading', step: 'Optimizing your days…' })
      const plan = buildItinerary({ request, destination, pool, weatherByDate, cityInfo })

      setItinerary(plan)
      setTrips(saveTrip(plan)) // auto-saved → readable offline later
      setStatus({ phase: 'idle' })
    } catch (err) {
      setStatus({
        phase: 'error',
        message: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      })
    }
  }, [])

  const openTrip = useCallback((trip: Itinerary) => {
    setItinerary(trip)
    setStatus({ phase: 'idle' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const removeTrip = useCallback(
    (id: string) => {
      setTrips(deleteTrip(id))
      if (itinerary?.id === id) setItinerary(null)
    },
    [itinerary],
  )

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            ✈
          </span>
          <div>
            <h1>Wayfarer</h1>
            <p className="tagline">Smart itineraries, weather-aware, offline-ready</p>
          </div>
        </div>
        {!online && <span className="offline-pill">Offline — showing saved data</span>}
      </header>

      <main>
        <TripForm onSubmit={generate} busy={status.phase === 'loading'} />

        {status.phase === 'loading' && (
          <div className="status-card" role="status">
            <div className="spinner" aria-hidden />
            <p>{status.step}</p>
          </div>
        )}
        {status.phase === 'error' && (
          <div className="status-card error" role="alert">
            <p>{status.message}</p>
          </div>
        )}

        {itinerary && <ItineraryView itinerary={itinerary} />}

        {!itinerary && status.phase === 'idle' && (
          <SavedTrips trips={trips} onOpen={openTrip} onDelete={removeTrip} />
        )}
      </main>

      <footer className="app-footer">
        <p>
          Maps & places © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>{' '}
          contributors · Weather by <a href="https://open-meteo.com/">Open-Meteo</a> · City
          summaries from Wikipedia
        </p>
      </footer>
    </div>
  )
}

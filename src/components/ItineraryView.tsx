import { useState } from 'react'
import type { Itinerary } from '../types'
import {
  downloadOfflineArea,
  isOfflineMapsSupported,
  type DownloadProgress,
} from '../offline/tiles'
import MapView, { DAY_COLORS } from './MapView'
import DayCard from './DayCard'
import CityOverview from './CityOverview'

export default function ItineraryView({ itinerary }: { itinerary: Itinerary }) {
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const [downloaded, setDownloaded] = useState(false)

  const downloadArea = async () => {
    if (progress) return
    setDownloaded(false)
    try {
      await downloadOfflineArea(itinerary.destination, setProgress)
      setDownloaded(true)
    } finally {
      setProgress(null)
    }
  }

  const { destination, request } = itinerary

  return (
    <div className="itinerary">
      <header className="itinerary-header">
        <div>
          <h2>
            {destination.name}
            {destination.admin1 && destination.admin1 !== destination.name
              ? `, ${destination.admin1}`
              : ''}
          </h2>
          <p className="muted">
            {request.startDate} · {request.days} {request.days === 1 ? 'day' : 'days'} ·
            saved for offline reading
          </p>
        </div>
        <div className="offline-actions">
          <button
            className="secondary"
            onClick={downloadArea}
            disabled={!!progress || !isOfflineMapsSupported()}
            title={
              isOfflineMapsSupported()
                ? 'Store map tiles of the city area on this device'
                : 'Offline maps need a browser with Cache Storage'
            }
          >
            {progress
              ? `Downloading… ${progress.done}/${progress.total}`
              : downloaded
                ? '✓ Offline map ready'
                : '⬇ Download offline map'}
          </button>
        </div>
      </header>

      {itinerary.forecastPartial && (
        <p className="banner">
          Part of your trip is beyond the 16-day forecast horizon. Re-open the app closer
          to departure — the plan will show live weather.
        </p>
      )}

      <MapView itinerary={itinerary} />

      <div className="days">
        {itinerary.days.map((day, i) => (
          <DayCard key={day.date} day={day} color={DAY_COLORS[i % DAY_COLORS.length]} />
        ))}
      </div>

      <CityOverview itinerary={itinerary} />

      {itinerary.parks.length > 0 && (
        <section className="card parks">
          <h2>Parks & nature nearby</h2>
          <p className="muted">
            National/state parks and reserves within reach — worth a detour if you have
            spare time.
          </p>
          <ul className="park-list">
            {itinerary.parks.map((park) => (
              <li key={park.id}>
                <span aria-hidden>{park.kind === 'national_park' ? '🏞️' : '🌳'}</span>{' '}
                <strong>{park.name}</strong>{' '}
                <span className="muted">
                  {park.distanceKm < 1 ? '<1' : `~${Math.round(park.distanceKm)}`} km away
                </span>
                {park.website && (
                  <>
                    {' · '}
                    <a href={park.website} target="_blank" rel="noreferrer">
                      website
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

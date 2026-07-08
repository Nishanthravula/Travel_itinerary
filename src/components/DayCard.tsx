import type { ItineraryDay } from '../types'
import { minutesToHHMM } from '../types'
import WeatherBadge from './WeatherBadge'

const KIND_ICON: Record<string, string> = {
  attraction: '🏛️',
  museum: '🖼️',
  viewpoint: '🌇',
  restaurant: '🍽️',
  cafe: '☕',
  park: '🌳',
  national_park: '🏞️',
}

function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

export default function DayCard({ day, color }: { day: ItineraryDay; color: string }) {
  return (
    <section className="day-card card">
      <header className="day-header">
        <div className="day-title">
          <span className="day-dot" style={{ background: color }} aria-hidden />
          <h3>
            {day.label} <span className="day-date">{formatDate(day.date)}</span>
          </h3>
        </div>
        <WeatherBadge weather={day.weather} />
      </header>

      {day.notes.map((note) => (
        <p key={note} className="day-note">
          {note}
        </p>
      ))}

      {day.stops.length === 0 ? (
        <p className="muted">
          Rest day — travel time takes this day. Explore around your hotel.
        </p>
      ) : (
        <ol className="timeline">
          {day.stops.map((stop) => (
            <li key={`${stop.place.id}-${stop.startMin}`} className="stop">
              <span className="stop-time">{minutesToHHMM(stop.startMin)}</span>
              <div className="stop-body">
                <div className="stop-name">
                  <span aria-hidden>{KIND_ICON[stop.place.kind] ?? '📍'}</span>{' '}
                  {stop.place.website ? (
                    <a href={stop.place.website} target="_blank" rel="noreferrer">
                      {stop.place.name}
                    </a>
                  ) : (
                    stop.place.name
                  )}
                </div>
                <div className="stop-meta">
                  ~{Math.round(stop.durationMin / 15) * 15} min
                  {stop.place.openingHours && <> · hours: {stop.place.openingHours}</>}
                </div>
                {stop.note && <div className="stop-note">{stop.note}</div>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

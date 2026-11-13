import type { ComponentType } from 'react'
import type { ItineraryDay, PlaceKind, TransportMode } from '../types'
import { minutesToHHMM } from '../types'
import { formatDuration } from '../format'
import { TRANSPORT } from '../planner/transport'
import {
  CoffeeIcon, MarketIcon, MealIcon, MuseumIcon, SightIcon, TreeIcon, ViewIcon,
} from '../ui/icons'
import { formatDay } from './SearchBar/dateRange'
import WeatherBadge from './WeatherBadge'

const KIND: Record<PlaceKind, { Icon: ComponentType<{ size?: number }>; label: string }> = {
  attraction: { Icon: SightIcon, label: 'Sight' },
  museum: { Icon: MuseumIcon, label: 'Museum' },
  viewpoint: { Icon: ViewIcon, label: 'Viewpoint' },
  restaurant: { Icon: MealIcon, label: 'Restaurant' },
  cafe: { Icon: CoffeeIcon, label: 'Café' },
  market: { Icon: MarketIcon, label: 'Local stop' },
  park: { Icon: TreeIcon, label: 'Park' },
  national_park: { Icon: TreeIcon, label: 'Nature' },
}

interface Props {
  day: ItineraryDay
  transport: TransportMode
}

/**
 * One day drawn as a route: stops are stations on a line, and the
 * stretches between them carry the estimated travel time.
 */
export default function DayTimeline({ day, transport }: Props) {
  return (
    <section className="day" aria-label={`${day.label}, ${formatDay(day.date)}`}>
      <header className="day-head">
        <h3>{formatDay(day.date)}</h3>
        <WeatherBadge weather={day.weather} />
      </header>

      {day.notes.map((note) => (
        <p key={note} className="day-note">
          {note}
        </p>
      ))}

      {day.stops.length === 0 ? (
        <p className="empty">
          A travel day. Nothing is scheduled around your flight — settle in near where you are
          staying.
        </p>
      ) : (
        <ol className="route">
          {day.stops.map((stop, i) => {
            const { Icon, label } = KIND[stop.place.kind] ?? KIND.attraction
            return (
              <li key={`${stop.place.id}-${stop.startMin}`} className="route-item">
                {stop.travelFromPrevMin !== undefined && stop.travelFromPrevMin > 0 && (
                  <p className="hop" data-testid="hop">
                    ≈ {formatDuration(stop.travelFromPrevMin)}{' '}
                    {TRANSPORT[stop.travelBy ?? transport].verb}
                  </p>
                )}
                <article className="stop" data-testid="stop">
                  <time className="stop-time">{minutesToHHMM(stop.startMin)}</time>
                  <span className="stop-node" aria-hidden>
                    {i + 1}
                  </span>
                  <div className="stop-body">
                    <h4 className="stop-name">
                      {stop.place.website ? (
                        <a href={stop.place.website} target="_blank" rel="noreferrer">
                          {stop.place.name}
                        </a>
                      ) : (
                        stop.place.name
                      )}
                    </h4>
                    <p className="stop-meta">
                      <Icon size={15} />
                      <span>
                        {label}
                        {stop.place.cuisine ? `, ${stop.place.cuisine}` : ''}, about{' '}
                        {formatDuration(Math.round(stop.durationMin / 5) * 5)}
                      </span>
                    </p>
                    {stop.note && <p className="stop-note">{stop.note}</p>}
                    {stop.place.openingHours && (
                      <p className="stop-hours">Listed hours: {stop.place.openingHours}</p>
                    )}
                  </div>
                </article>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

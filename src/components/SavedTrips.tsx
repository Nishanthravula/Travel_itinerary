import type { Itinerary } from '../types'

interface Props {
  trips: Itinerary[]
  onOpen: (trip: Itinerary) => void
  onDelete: (id: string) => void
}

/** Previously generated itineraries — available fully offline. */
export default function SavedTrips({ trips, onOpen, onDelete }: Props) {
  if (trips.length === 0) return null
  return (
    <section className="saved-trips">
      <h2>Saved trips</h2>
      <ul className="trip-list">
        {trips.map((trip) => (
          <li key={trip.id} className="card trip-item">
            <button className="trip-open" onClick={() => onOpen(trip)}>
              <strong>{trip.destination.name}</strong>
              <span className="muted">
                {trip.request.startDate} · {trip.request.days}{' '}
                {trip.request.days === 1 ? 'day' : 'days'}
              </span>
            </button>
            <button
              className="trip-delete"
              onClick={() => onDelete(trip.id)}
              aria-label={`Delete trip to ${trip.destination.name}`}
              title="Delete"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

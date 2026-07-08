import { useState, type FormEvent } from 'react'
import type { TripRequest } from '../types'
import { addDaysISO } from '../types'

interface Props {
  onSubmit: (request: TripRequest) => void
  busy: boolean
}

export default function TripForm({ onSubmit, busy }: Props) {
  const [destination, setDestination] = useState('')
  const [startDate, setStartDate] = useState(() =>
    addDaysISO(new Date().toISOString().slice(0, 10), 7),
  )
  const [days, setDays] = useState(3)
  const [showFlights, setShowFlights] = useState(false)
  const [arrivalTime, setArrivalTime] = useState('')
  const [arrivalFlight, setArrivalFlight] = useState('')
  const [departureTime, setDepartureTime] = useState('')
  const [departureFlight, setDepartureFlight] = useState('')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!destination.trim() || busy) return
    onSubmit({
      destinationQuery: destination.trim(),
      startDate,
      days,
      flights: {
        arrivalTime: arrivalTime || undefined,
        arrivalFlight: arrivalFlight.trim() || undefined,
        departureTime: departureTime || undefined,
        departureFlight: departureFlight.trim() || undefined,
      },
    })
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <form className="trip-form card" onSubmit={handleSubmit}>
      <div className="form-grid">
        <label className="field field-wide">
          <span>Where to?</span>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="e.g. Kyoto, Japan"
            required
            autoFocus
            disabled={busy}
          />
        </label>

        <label className="field">
          <span>Start date</span>
          <input
            type="date"
            value={startDate}
            min={today}
            onChange={(e) => setStartDate(e.target.value)}
            required
            disabled={busy}
          />
        </label>

        <label className="field">
          <span>Days</span>
          <input
            type="number"
            min={1}
            max={14}
            value={days}
            onChange={(e) => setDays(Math.max(1, Math.min(14, Number(e.target.value) || 1)))}
            disabled={busy}
          />
        </label>
      </div>

      <button
        type="button"
        className="link-button"
        onClick={() => setShowFlights((v) => !v)}
        aria-expanded={showFlights}
      >
        {showFlights ? '− Hide flight details' : '+ Add flight details (optional)'}
      </button>

      {showFlights && (
        <div className="form-grid flights">
          <label className="field">
            <span>Arrival time (day 1)</span>
            <input
              type="time"
              value={arrivalTime}
              onChange={(e) => setArrivalTime(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="field">
            <span>Arrival flight #</span>
            <input
              type="text"
              value={arrivalFlight}
              onChange={(e) => setArrivalFlight(e.target.value)}
              placeholder="e.g. UA 837"
              disabled={busy}
            />
          </label>
          <label className="field">
            <span>Departure time (last day)</span>
            <input
              type="time"
              value={departureTime}
              onChange={(e) => setDepartureTime(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="field">
            <span>Departure flight #</span>
            <input
              type="text"
              value={departureFlight}
              onChange={(e) => setDepartureFlight(e.target.value)}
              placeholder="e.g. UA 838"
              disabled={busy}
            />
          </label>
        </div>
      )}

      <button className="primary" type="submit" disabled={busy || !destination.trim()}>
        {busy ? 'Planning…' : 'Plan my trip'}
      </button>
    </form>
  )
}

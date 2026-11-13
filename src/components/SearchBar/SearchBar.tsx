import { useEffect, useState, type FormEvent } from 'react'
import type { Destination, FlightDetails, TransportMode, TripRequest } from '../../types'
import { addDaysISO, daysBetweenInclusive } from '../../types'
import { DEFAULT_TRANSPORT, DEFAULT_TRAVELLERS } from '../../share'
import { ArrowRightIcon } from '../../ui/icons'
import DateRangeField from './DateRangeField'
import DestinationField from './DestinationField'
import Popover from './Popover'
import TransportField, { MODES } from './TransportField'
import TravellersField, { peopleLabel } from './TravellersField'
import { clampRange, formatRange, todayISO } from './dateRange'

interface Props {
  initial: Partial<TripRequest>
  busy: boolean
  onSubmit: (request: TripRequest, picked?: Destination) => void
}

type Segment = 'when' | 'who' | 'how' | null

/**
 * The whole request in one bar: where, when, who, how. Each part opens a
 * small panel; nothing else is asked unless the traveller adds flights.
 */
export default function SearchBar({ initial, busy, onSubmit }: Props) {
  const today = todayISO()
  const [query, setQuery] = useState(initial.destinationQuery ?? '')
  const [picked, setPicked] = useState<Destination | undefined>()
  /** Position of the place meant, kept while the text still names it. */
  const [near, setNear] = useState(initial.near)
  const [range, setRange] = useState(() =>
    clampRange(
      initial.startDate ?? addDaysISO(today, 7),
      initial.endDate ?? addDaysISO(initial.startDate ?? addDaysISO(today, 7), 2),
      today,
    ),
  )
  const [travellers, setTravellers] = useState(initial.travellers ?? DEFAULT_TRAVELLERS)
  const [transport, setTransport] = useState<TransportMode>(initial.transport ?? DEFAULT_TRANSPORT)
  const [flights, setFlights] = useState<FlightDetails>(initial.flights ?? {})
  const [showFlights, setShowFlights] = useState(
    Boolean(initial.flights?.arrivalTime || initial.flights?.departureTime),
  )
  const [open, setOpen] = useState<Segment>(null)

  // A saved trip or share link was opened: show its request in the bar.
  useEffect(() => {
    setQuery(initial.destinationQuery ?? '')
    if (initial.startDate && initial.endDate) {
      setRange(clampRange(initial.startDate, initial.endDate, todayISO()))
    }
    if (initial.travellers) setTravellers(initial.travellers)
    if (initial.transport) setTransport(initial.transport)
    setPicked(undefined)
    setNear(initial.near)
    setFlights(initial.flights ?? {})
    setShowFlights(Boolean(initial.flights?.arrivalTime || initial.flights?.departureTime))
  }, [initial])

  const toggle = (s: Exclude<Segment, null>) => setOpen((cur) => (cur === s ? null : s))
  const mode = MODES.find((m) => m.id === transport)!

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const destinationQuery = query.trim()
    if (!destinationQuery || busy) return
    setOpen(null)
    const clean = (s?: string) => s?.trim() || undefined
    // Only trust the picked suggestion while the text still names it.
    const usePicked = picked && picked.name === destinationQuery ? picked : undefined
    onSubmit(
      {
        destinationQuery,
        startDate: range.from,
        endDate: range.to,
        days: daysBetweenInclusive(range.from, range.to),
        travellers,
        transport,
        near: usePicked ? { lat: usePicked.lat, lon: usePicked.lon } : near,
        flights: showFlights
          ? {
              arrivalTime: clean(flights.arrivalTime),
              arrivalFlight: clean(flights.arrivalFlight),
              departureTime: clean(flights.departureTime),
              departureFlight: clean(flights.departureFlight),
            }
          : {},
      },
      usePicked,
    )
  }

  const flight = (key: keyof FlightDetails) => ({
    value: flights[key] ?? '',
    disabled: busy,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setFlights((f) => ({ ...f, [key]: e.target.value })),
  })

  return (
    <form className="search" onSubmit={submit} role="search" aria-label="Plan a trip">
      <div className="search-bar">
        <DestinationField
          value={query}
          disabled={busy}
          onChange={(text) => {
            setQuery(text)
            if (picked && text !== picked.name) setPicked(undefined)
            setNear(undefined)
          }}
          onPick={(d) => {
            setPicked(d)
            setNear({ lat: d.lat, lon: d.lon })
          }}
        />

        <div className="segment">
          <button
            type="button"
            className="segment-button"
            aria-haspopup="dialog"
            aria-expanded={open === 'when'}
            disabled={busy}
            onClick={() => toggle('when')}
          >
            <span className="segment-label">When</span>
            <span className="segment-value">{formatRange(range.from, range.to)}</span>
          </button>
          {open === 'when' && (
            <Popover label="Trip dates" onClose={() => setOpen(null)} className="popover-calendar">
              <DateRangeField
                from={range.from}
                to={range.to}
                onChange={(from, to) => setRange({ from, to })}
                onDone={() => setOpen(null)}
              />
            </Popover>
          )}
        </div>

        <div className="segment">
          <button
            type="button"
            className="segment-button"
            aria-haspopup="dialog"
            aria-expanded={open === 'who'}
            disabled={busy}
            onClick={() => toggle('who')}
          >
            <span className="segment-label">Who</span>
            <span className="segment-value">{peopleLabel(travellers)}</span>
          </button>
          {open === 'who' && (
            <Popover label="Number of people" onClose={() => setOpen(null)} align="end">
              <TravellersField value={travellers} onChange={setTravellers} />
            </Popover>
          )}
        </div>

        <div className="segment">
          <button
            type="button"
            className="segment-button"
            aria-haspopup="dialog"
            aria-expanded={open === 'how'}
            disabled={busy}
            onClick={() => toggle('how')}
          >
            <span className="segment-label">How</span>
            <span className="segment-value">{mode.label}</span>
          </button>
          {open === 'how' && (
            <Popover label="Getting around" onClose={() => setOpen(null)} align="end">
              <TransportField
                value={transport}
                onChange={(m) => {
                  setTransport(m)
                  setOpen(null)
                }}
              />
            </Popover>
          )}
        </div>

        <button
          className="search-submit"
          type="submit"
          data-testid="search-submit"
          disabled={busy || !query.trim()}
        >
          <span>{busy ? 'Planning' : 'Plan trip'}</span>
          <ArrowRightIcon />
        </button>
      </div>

      <button
        type="button"
        className="text-button"
        aria-expanded={showFlights}
        onClick={() => setShowFlights((v) => !v)}
      >
        {showFlights ? 'Remove flight times' : 'Add flight times'}
      </button>

      {showFlights && (
        <div className="flights">
          <label className="field">
            <span>Landing, first day</span>
            <input type="time" {...flight('arrivalTime')} />
          </label>
          <label className="field">
            <span>Flight number</span>
            <input type="text" placeholder="UA 837" {...flight('arrivalFlight')} />
          </label>
          <label className="field">
            <span>Take-off, last day</span>
            <input type="time" {...flight('departureTime')} />
          </label>
          <label className="field">
            <span>Flight number</span>
            <input type="text" placeholder="UA 838" {...flight('departureFlight')} />
          </label>
          <p className="hint flights-hint">
            The first day starts 2.5 hours after landing; the last ends 3.5 hours before take-off.
          </p>
        </div>
      )}
    </form>
  )
}

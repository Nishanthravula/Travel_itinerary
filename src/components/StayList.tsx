import type { PlanOption, StayType, Trip } from '../types'
import { formatKm, formatRating } from '../format'
import { citySearchUrl, roomsFor } from '../planner/stays'
import { BedIcon, ExternalIcon, StarIcon } from '../ui/icons'

const TYPE: Record<StayType, string> = {
  hotel: 'Hotel',
  guest_house: 'Guest house',
  hostel: 'Hostel',
  apartment: 'Apartment',
}

interface Props {
  trip: Trip
  option: PlanOption
}

/**
 * Places to stay near where this plan spends its days. We show what the
 * open map data knows — never a price — and hand off to a booking site
 * with the dates and party already filled in.
 */
export default function StayList({ trip, option }: Props) {
  const { request, destination } = trip
  const rooms = roomsFor(request.travellers)
  const party = `${request.travellers === 1 ? '1 person' : `${request.travellers} people`}, ${rooms} room${rooms === 1 ? '' : 's'}`

  return (
    <section className="stays" aria-label="Places to stay">
      <header className="day-head">
        <h3>Where to stay</h3>
        <span className="weather">{party}</span>
      </header>
      <p className="day-note">
        Chosen {option.summary.baseLabel}, close to where this plan spends its days.
      </p>

      {option.stays.length === 0 ? (
        <div className="empty">
          <p>No individual places to stay are mapped around {destination.name}.</p>
          <a
            className="button"
            href={citySearchUrl(destination.name, request)}
            target="_blank"
            rel="noreferrer"
          >
            Search stays in {destination.name}
            <ExternalIcon size={15} />
          </a>
        </div>
      ) : (
        <ul className="stay-list">
          {option.stays.map((s, i) => (
            <li key={s.id} className="stay" data-testid="stay-row">
              <span className="stay-node" aria-hidden>
                {String.fromCharCode(65 + i)}
              </span>
              <div className="stay-body">
                <h4 className="stop-name">{s.name}</h4>
                <p className="stop-meta">
                  <BedIcon size={15} />
                  <span>
                    {TYPE[s.type]}
                    {s.stars ? `, ${s.stars} star${s.stars === 1 ? '' : 's'}` : ''}, ≈{' '}
                    {formatKm(s.distanceFromBaseKm)} from the centre of this plan
                    {s.parking ? ', parking' : ''}
                  </span>
                </p>
                {s.rating !== undefined && (
                  <p className="stop-rating" data-testid="rating">
                    <StarIcon size={14} />
                    {formatRating(s.rating, s.ratingCount)}
                    {s.priceLevel ? `, ${s.priceLevel}` : ''}
                  </p>
                )}
              </div>
              <div className="stay-actions">
                {(s.website ?? s.mapsUrl) && (
                  <a
                    className="button button-quiet"
                    href={s.website ?? s.mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {s.website ? 'Website' : 'Google Maps'}
                  </a>
                )}
                <a className="button" href={s.bookingUrl} target="_blank" rel="noreferrer">
                  Check prices
                  <ExternalIcon size={15} />
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">
        Prices and availability are shown on the booking site, for {request.startDate} to{' '}
        {new URL(citySearchUrl(destination.name, request)).searchParams.get('checkout')}.
      </p>
    </section>
  )
}

import type { Trip } from '../types'
import { placeTitle, requestLine } from '../format'
import { LinkIcon } from '../ui/icons'

interface Props {
  trip: Trip
  onCopyLink: () => void
}

/** The destination as a banner: its photo when Wikipedia has one. */
export default function TripHero({ trip, onCopyLink }: Props) {
  const image = trip.cityInfo.image
  return (
    <header className={image ? 'trip-hero has-image' : 'trip-hero'} data-testid="trip-hero">
      {image && (
        <img
          className="trip-hero-img"
          src={image.url}
          alt=""
          decoding="async"
          referrerPolicy="no-referrer"
        />
      )}
      <div className="trip-hero-body">
        <div>
          <h2 className="trip-title">{placeTitle(trip.destination)}</h2>
          <p className="trip-meta">{requestLine(trip.request)}</p>
        </div>
        <button className="button with-icon hero-button" onClick={onCopyLink}>
          <LinkIcon size={16} />
          Copy link
        </button>
      </div>
      {image && (
        <a className="trip-hero-credit" href={image.pageUrl} target="_blank" rel="noreferrer">
          Photo: Wikipedia
        </a>
      )}
    </header>
  )
}

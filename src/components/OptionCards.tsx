import type { Trip } from '../types'
import { formatDuration } from '../format'
import { ArrowRightIcon } from '../ui/icons'

interface Props {
  trip: Trip
  onOpen: (index: number) => void
}

/** The plans side by side, so the differences are what you read. */
export default function OptionCards({ trip, onOpen }: Props) {
  return (
    <ol className={`options options-${trip.options.length}`} aria-label="Plan options">
      {trip.options.map((o, i) => (
        <li className="option" key={o.style} data-testid="option-card">
          <h3 className="option-title">{o.title}</h3>
          <p className="option-tagline">{o.tagline}</p>

          <dl className="option-stats">
            <div>
              <dt>Sights</dt>
              <dd>{o.summary.sightCount}</dd>
            </div>
            <div>
              <dt>Moving</dt>
              <dd>≈ {formatDuration(o.summary.travelMin)}</dd>
            </div>
            <div>
              <dt>Indoors</dt>
              <dd>{Math.round(o.summary.indoorShare * 100)}%</dd>
            </div>
          </dl>

          {o.summary.headlineSights.length > 0 && (
            <ul className="option-sights" aria-label="Includes">
              {o.summary.headlineSights.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          )}

          <p className="option-base">Stays picked {o.summary.baseLabel}</p>

          <button className="button button-primary option-open" onClick={() => onOpen(i)}>
            <span>
              View plan<span className="visually-hidden">: {o.title}</span>
            </span>
            <ArrowRightIcon size={16} />
          </button>
        </li>
      ))}
    </ol>
  )
}

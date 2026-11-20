import type { PlanOption, Trip } from '../types'
import { formatDuration } from '../format'
import { ArrowRightIcon } from '../ui/icons'
import DayBar from './DayBar'
import Thumb from './Thumb'

interface Props {
  trip: Trip
  onOpen: (index: number) => void
}

const FOOD = new Set(['restaurant', 'cafe', 'market'])

/** The first headline sight that has a photo, else the first headline sight. */
function coverOf(o: PlanOption) {
  const sights = o.days.flatMap((d) => d.stops).filter((s) => !FOOD.has(s.place.kind))
  const headline = o.summary.headlineSights
  const ordered = [...sights].sort(
    (a, b) => indexOr(headline, a.place.name) - indexOr(headline, b.place.name),
  )
  return (ordered.find((s) => s.place.photo) ?? ordered[0])?.place
}
const indexOr = (list: string[], v: string) => {
  const i = list.indexOf(v)
  return i < 0 ? list.length : i
}

/** Sights per day, 1–5 dots. */
function Pace({ o }: { o: PlanOption }) {
  const perDay = Math.round(o.summary.sightCount / Math.max(o.days.length, 1))
  const dots = Math.max(1, Math.min(5, perDay))
  return (
    <span className="pace" aria-label={`About ${perDay} sights a day`}>
      {Array.from({ length: 5 }, (_, i) => (
        <i key={i} className={i < dots ? 'on' : ''} />
      ))}
    </span>
  )
}

/** The plans side by side, so the differences are what you see. */
export default function OptionCards({ trip, onOpen }: Props) {
  return (
    <ol className={`options options-${trip.options.length}`} aria-label="Plan options">
      {trip.options.map((o, i) => {
        const cover = coverOf(o)
        const indoor = Math.round(o.summary.indoorShare * 100)
        return (
          <li className="option" key={o.style} data-testid="option-card">
            <div className="option-cover">
              {cover && <Thumb place={cover} size="lg" />}
              <span className="option-badge">{o.days.length} {o.days.length === 1 ? 'day' : 'days'}</span>
            </div>
            <div className="option-body">
              <h3 className="option-title">{o.title}</h3>
              <p className="option-tagline">{o.tagline}</p>

              <dl className="option-stats">
                <div>
                  <dt>Pace</dt>
                  <dd>
                    <Pace o={o} />
                  </dd>
                </div>
                <div>
                  <dt>Sights</dt>
                  <dd>{o.summary.sightCount}</dd>
                </div>
                <div>
                  <dt>Moving</dt>
                  <dd>≈ {formatDuration(o.summary.travelMin)}</dd>
                </div>
              </dl>

              <div className="option-split" aria-label={`${indoor}% indoors, ${100 - indoor}% outdoors`}>
                <span className="split-bar">
                  <span className="split-in" style={{ width: `${indoor}%` }} />
                </span>
                <span className="split-text">
                  {indoor}% indoors · {100 - indoor}% outdoors
                </span>
              </div>

              <div className="option-days" aria-label="Each day at a glance">
                {o.days.map((d) => (
                  <div className="option-day" key={d.date}>
                    <span className="option-day-label">{d.label.replace('Day ', 'D')}</span>
                    <DayBar day={d} compact />
                  </div>
                ))}
              </div>

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
            </div>
          </li>
        )
      })}
    </ol>
  )
}

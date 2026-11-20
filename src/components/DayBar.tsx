import type { ItineraryDay } from '../types'
import { daySegments, type SegmentKind } from './dayBar'

const LABEL: Record<SegmentKind, string> = {
  sight: 'Sights',
  food: 'Food',
  nature: 'Parks',
  travel: 'Getting around',
}

interface Props {
  day: ItineraryDay
  /** A thin strip without hour marks or legend, for option cards. */
  compact?: boolean
}

/** The day at a glance: what fills it, and when, from morning to night. */
export default function DayBar({ day, compact = false }: Props) {
  const segments = daySegments(day)
  if (segments.length === 0) return compact ? <div className="daybar daybar-compact daybar-empty" /> : null

  const kinds = [...new Set(segments.map((s) => s.kind))]
  const summary = kinds.map((k) => LABEL[k].toLowerCase()).join(', ')

  return (
    <div className={compact ? 'daybar daybar-compact' : 'daybar'} data-testid="daybar">
      <div className="daybar-track" role="img" aria-label={`The day at a glance: ${summary}`}>
        {segments.map((s, i) => (
          <span
            key={i}
            className={`daybar-seg seg-${s.kind}`}
            style={{ left: `${s.start * 100}%`, width: `${Math.max(s.width * 100, 0.6)}%` }}
            title={s.label}
          />
        ))}
      </div>
      {!compact && (
        <div className="daybar-foot" aria-hidden>
          <span>Morning</span>
          <span className="daybar-legend">
            {kinds.map((k) => (
              <span key={k} className="legend-item">
                <i className={`seg-${k}`} />
                {LABEL[k]}
              </span>
            ))}
          </span>
          <span>Night</span>
        </div>
      )}
    </div>
  )
}

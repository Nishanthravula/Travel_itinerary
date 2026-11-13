import { useEffect, useRef, useState } from 'react'
import { addDaysISO, daysBetweenInclusive } from '../../types'
import { MAX_DAYS } from '../../share'
import { ChevronLeftIcon, ChevronRightIcon } from '../../ui/icons'
import { MONTH_NAMES, formatDay, monthGrid, todayISO } from './dateRange'

interface Props {
  from: string
  to: string
  onChange: (from: string, to: string) => void
  /** Both ends chosen. */
  onDone: () => void
}

const WEEK = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const ym = (iso: string) => ({ y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)) })
const shiftMonth = (y: number, m: number, by: number) => {
  const d = new Date(Date.UTC(y, m - 1 + by, 1))
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 }
}

/**
 * Range calendar. First click sets the first day, second sets the last;
 * arrow keys move by day and week. Trips are capped at 14 days, so days
 * beyond that are unavailable while choosing the end.
 */
export default function DateRangeField({ from, to, onChange, onDone }: Props) {
  const today = todayISO()
  const [view, setView] = useState(() => ym(from))
  /** Set while waiting for the second click. */
  const [anchor, setAnchor] = useState<string | null>(null)
  const [cursor, setCursor] = useState(from)
  const gridRef = useRef<HTMLDivElement>(null)
  const moveFocus = useRef(false)

  const second = shiftMonth(view.y, view.m, 1)
  const lastAllowed = anchor ? addDaysISO(anchor, MAX_DAYS - 1) : null
  const isDisabled = (d: string) => d < today || (lastAllowed !== null && d > lastAllowed)

  useEffect(() => {
    if (!moveFocus.current) return
    moveFocus.current = false
    gridRef.current?.querySelector<HTMLElement>(`[data-date="${cursor}"]`)?.focus()
  }, [cursor, view])

  const choose = (d: string) => {
    if (isDisabled(d)) return
    if (anchor === null || d < anchor) {
      setAnchor(d)
      onChange(d, d)
    } else {
      onChange(anchor, d)
      setAnchor(null)
      onDone()
    }
  }

  const moveTo = (d: string) => {
    if (d < today) d = today
    const { y, m } = ym(d)
    const visible =
      (y === view.y && m === view.m) || (y === second.y && m === second.m)
    if (!visible) setView(d < `${view.y}-${String(view.m).padStart(2, '0')}` ? { y, m } : shiftMonth(y, m, -1))
    moveFocus.current = true
    setCursor(d)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    if (e.key in step) {
      e.preventDefault()
      moveTo(addDaysISO(cursor, step[e.key]))
    }
  }

  const status = anchor
    ? `Starts ${formatDay(anchor)} — choose the last day`
    : `${formatDay(from)} to ${formatDay(to)}, ${daysBetweenInclusive(from, to)} day${from === to ? '' : 's'}`

  const month = (y: number, m: number, extra = '') => (
    <div className={`cal-month ${extra}`} key={`${y}-${m}`}>
      <div className="cal-title" aria-hidden>
        {MONTH_NAMES[m - 1]} {y}
      </div>
      <div className="cal-grid" role="grid" aria-label={`${MONTH_NAMES[m - 1]} ${y}`}>
        {WEEK.map((w) => (
          <span key={w} className="cal-weekday" aria-hidden>
            {w}
          </span>
        ))}
        {monthGrid(y, m).map((d, i) =>
          d === null ? (
            <span key={`pad-${i}`} />
          ) : (
            <button
              key={d}
              type="button"
              data-date={d}
              data-autofocus={d === cursor ? '' : undefined}
              tabIndex={d === cursor ? 0 : -1}
              disabled={isDisabled(d)}
              aria-label={formatDay(d)}
              aria-pressed={d === from || d === to}
              className={[
                'cal-day',
                d > from && d < to ? 'in-range' : '',
                d === from ? 'is-start' : '',
                d === to ? 'is-end' : '',
                d === today ? 'is-today' : '',
              ].join(' ')}
              onClick={() => {
                setCursor(d)
                choose(d)
              }}
            >
              {Number(d.slice(8))}
            </button>
          ),
        )}
      </div>
    </div>
  )

  const canGoBack = `${view.y}-${String(view.m).padStart(2, '0')}` > today.slice(0, 7)

  return (
    <div className="calendar" onKeyDown={onKeyDown}>
      <div className="cal-nav">
        <button
          type="button"
          className="icon-button"
          aria-label="Earlier months"
          disabled={!canGoBack}
          onClick={() => setView(shiftMonth(view.y, view.m, -1))}
        >
          <ChevronLeftIcon />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Later months"
          onClick={() => setView(shiftMonth(view.y, view.m, 1))}
        >
          <ChevronRightIcon />
        </button>
      </div>
      <div className="cal-months" ref={gridRef}>
        {month(view.y, view.m)}
        {month(second.y, second.m, 'cal-second')}
      </div>
      <p className="cal-status" aria-live="polite">
        {status}
      </p>
    </div>
  )
}

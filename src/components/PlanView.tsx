import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import type { Trip } from '../types'
import { ArrowLeftIcon, MapIcon } from '../ui/icons'
import CityOverview from './CityOverview'
import DayTimeline from './DayTimeline'
import GoogleMapEmbed from './GoogleMapEmbed'
import StayList from './StayList'

const MapView = lazy(() => import('./MapView'))

/** Public key for Google's free embeddable map; set at build time. */
const EMBED_KEY: string | undefined = import.meta.env.VITE_GOOGLE_MAPS_EMBED_KEY

interface Props {
  trip: Trip
  index: number
  onSwitch: (index: number) => void
  onBack: () => void
}

type Tab = number | 'stay'

function useTheme(): 'light' | 'dark' {
  const query = '(prefers-color-scheme: dark)'
  const [dark, setDark] = useState(() => matchMedia(query).matches)
  useEffect(() => {
    const mq = matchMedia(query)
    const on = () => setDark(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return dark ? 'dark' : 'light'
}

/** One plan in full: a day at a time, with the map alongside. */
export default function PlanView({ trip, index, onSwitch, onBack }: Props) {
  const option = trip.options[index]
  const [tab, setTab] = useState<Tab>(0)
  const [mapOpen, setMapOpen] = useState(() => matchMedia('(min-width: 960px)').matches)
  const theme = useTheme()

  useEffect(() => {
    const mq = matchMedia('(min-width: 960px)')
    const on = () => mq.matches && setMapOpen(true)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  const activeTab: Tab = tab !== 'stay' && tab >= option.days.length ? 0 : tab
  const sections = useRef<Map<Tab, HTMLElement>>(new Map())
  /** While a chip-click scroll is running, ignore what scrolls past. */
  const jumping = useRef(false)

  // The map follows the day being read, as the list scrolls.
  useEffect(() => {
    const seen = new Map<Element, boolean>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target, e.isIntersecting)
        if (jumping.current) return
        for (const [key, el] of sections.current) {
          if (seen.get(el)) {
            setTab(key)
            return
          }
        }
      },
      // A section is "current" while it crosses the upper third of the screen.
      { rootMargin: '-25% 0px -65% 0px' },
    )
    for (const el of sections.current.values()) observer.observe(el)
    return () => observer.disconnect()
  }, [index, option.days.length])

  const jumpTo = (key: Tab) => {
    setTab(key)
    const el = sections.current.get(key)
    if (!el) return
    jumping.current = true
    el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
    window.setTimeout(() => (jumping.current = false), 700)
  }
  const register = (key: Tab) => (el: HTMLElement | null) => {
    if (el) sections.current.set(key, el)
    else sections.current.delete(key)
  }

  const chips: Array<{ key: Tab; label: string; testid: string }> = [
    ...option.days.map((d, i) => ({ key: i as Tab, label: d.label, testid: 'day-tab' })),
    { key: 'stay', label: 'Stay', testid: 'stay-tab' },
  ]

  return (
    <div className="plan" data-testid="plan-view">
      <div className="plan-main">
        <div className="plan-bar">
          <button className="text-button with-icon" onClick={onBack}>
            <ArrowLeftIcon size={16} />
            All options
          </button>
          {trip.options.length > 1 && (
            <div className="switcher" role="group" aria-label="Plan option">
              {trip.options.map((o, i) => (
                <button
                  key={o.style}
                  aria-pressed={i === index}
                  className={i === index ? 'switch is-on' : 'switch'}
                  onClick={() => onSwitch(i)}
                >
                  {o.title}
                </button>
              ))}
            </div>
          )}
        </div>

        <h2 className="plan-title">{option.title}</h2>
        <p className="plan-tagline">{option.tagline}</p>

        <nav className="day-nav" aria-label="Jump to a day">
          {chips.map(({ key, label, testid }) => (
            <button
              key={String(key)}
              className={activeTab === key ? 'day-chip is-on' : 'day-chip'}
              aria-current={activeTab === key ? 'true' : undefined}
              style={
                key === 'stay'
                  ? undefined
                  : ({ '--day': `var(--day-${((key as number) % 7) + 1})` } as React.CSSProperties)
              }
              data-testid={testid}
              onClick={() => jumpTo(key)}
            >
              {key !== 'stay' && <i className="day-dot" aria-hidden />}
              {label}
            </button>
          ))}
          <button
            className="day-chip map-toggle"
            aria-expanded={mapOpen}
            onClick={() => setMapOpen((v) => !v)}
          >
            <MapIcon size={15} />
            {mapOpen ? 'Hide map' : 'Map'}
          </button>
        </nav>

        <div className="day-list">
          {option.days.map((d, i) => (
            <div
              key={d.date}
              ref={register(i)}
              className="day-section"
              style={{ '--day': `var(--day-${(i % 7) + 1})` } as React.CSSProperties}
            >
              <DayTimeline
                day={d}
                transport={trip.request.transport}
                hasFlight={
                  (i === 0 && Boolean(trip.request.flights.arrivalTime)) ||
                  (i === option.days.length - 1 && Boolean(trip.request.flights.departureTime))
                }
              />
            </div>
          ))}
          <div ref={register('stay')} className="day-section">
            <StayList trip={trip} option={option} />
          </div>
        </div>

        <CityOverview trip={trip} />
      </div>

      {mapOpen && (
        <aside className="plan-map" aria-label="Map">
          {trip.source !== 'google' ? (
            <Suspense fallback={<div className="map map-loading">Loading map…</div>}>
              <MapView option={option} activeDay={activeTab} theme={theme} />
            </Suspense>
          ) : EMBED_KEY ? (
            <GoogleMapEmbed
              option={option}
              activeDay={activeTab}
              transport={trip.request.transport}
              embedKey={EMBED_KEY}
            />
          ) : (
            // Google's place data may only be mapped on a Google map.
            <div className="map map-loading" data-testid="no-map">
              <p>Each stop links to Google Maps. An embedded map appears once a map key is set.</p>
            </div>
          )}
        </aside>
      )}
    </div>
  )
}

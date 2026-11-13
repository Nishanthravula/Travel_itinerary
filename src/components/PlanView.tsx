import { Suspense, lazy, useEffect, useState } from 'react'
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

  const onTabKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const order: Tab[] = [...option.days.map((_, i) => i), 'stay']
    const at = order.indexOf(activeTab)
    const next = order[(at + (e.key === 'ArrowRight' ? 1 : order.length - 1)) % order.length]
    setTab(next)
    const list = e.currentTarget
    requestAnimationFrame(() =>
      list.querySelector<HTMLElement>('[aria-selected="true"]')?.focus(),
    )
  }

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

        <div className="tabs" role="tablist" aria-label="Days" onKeyDown={onTabKey}>
          {option.days.map((d, i) => (
            <button
              key={d.date}
              role="tab"
              id={`tab-${i}`}
              aria-selected={activeTab === i}
              aria-controls="tab-panel"
              tabIndex={activeTab === i ? 0 : -1}
              className="tab"
              style={{ '--day': `var(--day-${(i % 7) + 1})` } as React.CSSProperties}
              data-testid="day-tab"
              onClick={() => setTab(i)}
            >
              {d.label}
            </button>
          ))}
          <button
            role="tab"
            id="tab-stay"
            aria-selected={activeTab === 'stay'}
            aria-controls="tab-panel"
            tabIndex={activeTab === 'stay' ? 0 : -1}
            className="tab tab-stay"
            data-testid="stay-tab"
            onClick={() => setTab('stay')}
          >
            Stay
          </button>
        </div>

        <button
          className="button map-toggle"
          aria-expanded={mapOpen}
          onClick={() => setMapOpen((v) => !v)}
        >
          <MapIcon size={16} />
          {mapOpen ? 'Hide map' : 'Show map'}
        </button>

        <div
          id="tab-panel"
          role="tabpanel"
          aria-labelledby={`tab-${activeTab}`}
          tabIndex={0}
          className="tab-panel"
          style={
            activeTab === 'stay'
              ? undefined
              : ({ '--day': `var(--day-${(activeTab % 7) + 1})` } as React.CSSProperties)
          }
        >
          {activeTab === 'stay' ? (
            <StayList trip={trip} option={option} />
          ) : (
            <DayTimeline day={option.days[activeTab]} transport={trip.request.transport} />
          )}
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

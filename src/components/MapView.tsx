import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Itinerary } from '../types'
import { minutesToHHMM } from '../types'

export const DAY_COLORS = [
  '#0f766e',
  '#4f46e5',
  '#b45309',
  '#be123c',
  '#15803d',
  '#7e22ce',
  '#0e7490',
  '#a16207',
  '#c2410c',
  '#1d4ed8',
  '#9f1239',
  '#166534',
  '#6d28d9',
  '#155e75',
]

function markerIcon(color: string, label: string): L.DivIcon {
  return L.divIcon({
    className: 'day-marker',
    html: `<span style="background:${color}">${label}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  })
}

/**
 * Leaflet map of the whole trip: numbered markers per stop, colour-coded
 * by day, with a dotted walking line per day. Tiles are cached by the
 * service worker, so previously viewed/downloaded areas work offline.
 */
export default function MapView({ itinerary }: { itinerary: Itinerary }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const map = L.map(container, { scrollWheelZoom: false })
    mapRef.current = map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map)

    const bounds = L.latLngBounds([])
    itinerary.days.forEach((day, di) => {
      const color = DAY_COLORS[di % DAY_COLORS.length]
      const path: L.LatLngExpression[] = []
      day.stops.forEach((stop, si) => {
        const ll: L.LatLngExpression = [stop.place.lat, stop.place.lon]
        path.push(ll)
        bounds.extend(ll)
        L.marker(ll, { icon: markerIcon(color, String(si + 1)) })
          .addTo(map)
          .bindPopup(
            `<strong>${escapeHtml(stop.place.name)}</strong><br/>${day.label} · ${minutesToHHMM(stop.startMin)}`,
          )
      })
      if (path.length > 1) {
        L.polyline(path, { color, weight: 3, opacity: 0.7, dashArray: '6 8' }).addTo(map)
      }
    })

    if (bounds.isValid()) map.fitBounds(bounds.pad(0.15))
    else map.setView([itinerary.destination.lat, itinerary.destination.lon], 13)

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [itinerary])

  return (
    <div className="map-wrap card">
      <div ref={containerRef} className="map" role="application" aria-label="Trip map" />
      <div className="map-legend">
        {itinerary.days.map((day, di) => (
          <span key={day.date} className="legend-item">
            <span
              className="day-dot"
              style={{ background: DAY_COLORS[di % DAY_COLORS.length] }}
              aria-hidden
            />
            {day.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

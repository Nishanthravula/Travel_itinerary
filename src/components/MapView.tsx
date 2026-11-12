import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { PlanOption } from '../types'
import { minutesToHHMM } from '../types'

/** OpenFreeMap: free, keyless vector tiles that permit production use. */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'

interface Props {
  option: PlanOption
  activeDay: number | 'stay'
  theme: 'light' | 'dark'
}

interface Pin {
  lat: number
  lon: number
  label: string
  title: string
  detail: string
  kind: 'stop' | 'stay' | 'base'
}

function pinsFor(option: PlanOption, activeDay: number | 'stay'): Pin[] {
  if (activeDay === 'stay') {
    return [
      { ...option.base, label: '', title: 'Centre of this plan', detail: '', kind: 'base' },
      ...option.stays.map(
        (s, i): Pin => ({
          lat: s.lat,
          lon: s.lon,
          label: String.fromCharCode(65 + i),
          title: s.name,
          detail: 'Place to stay',
          kind: 'stay',
        }),
      ),
    ]
  }
  return (option.days[activeDay]?.stops ?? []).map(
    (s, i): Pin => ({
      lat: s.place.lat,
      lon: s.place.lon,
      label: String(i + 1),
      title: s.place.name,
      detail: minutesToHHMM(s.startMin),
      kind: 'stop',
    }),
  )
}

/**
 * The active day on a map: numbered pins matching the timeline, joined in
 * order. Map data you have viewed is kept by the service worker, so it
 * still draws without a connection.
 */
export default function MapView({ option, activeDay, theme }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markers = useRef<maplibregl.Marker[]>([])
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let map: maplibregl.Map
    try {
      map = new maplibregl.Map({
        container: container.current!,
        style: STYLE_URL,
        center: [option.base.lon, option.base.lat],
        zoom: 12,
        attributionControl: { compact: true },
        cooperativeGestures: true,
      })
    } catch {
      setFailed(true) // no WebGL on this device
      return
    }
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.on('load', () => {
      map.addSource('route', {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
      })
      map.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#2743d6', 'line-width': 2.5, 'line-dasharray': [0.2, 2] },
      })
      setReady(true)
    })
    mapRef.current = map
    return () => {
      markers.current = []
      mapRef.current = null
      setReady(false)
      map.remove()
    }
    // The map is created once; the effect below keeps it in step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    markers.current.forEach((m) => m.remove())

    const pins = pinsFor(option, activeDay)
    const dayColor =
      activeDay === 'stay'
        ? ''
        : getComputedStyle(document.documentElement)
            .getPropertyValue(`--day-${(activeDay % 7) + 1}`)
            .trim()

    markers.current = pins.map((pin) => {
      const el = document.createElement('div')
      el.className = `pin pin-${pin.kind}`
      el.textContent = pin.label
      if (pin.kind === 'stop' && dayColor) el.style.background = dayColor
      el.setAttribute('role', 'img')
      el.setAttribute('aria-label', [pin.label, pin.title].filter(Boolean).join('. '))
      const body = document.createElement('div')
      const strong = document.createElement('strong')
      strong.textContent = pin.title
      body.append(strong)
      if (pin.detail) body.append(document.createElement('br'), pin.detail)
      return new maplibregl.Marker({ element: el })
        .setLngLat([pin.lon, pin.lat])
        .setPopup(new maplibregl.Popup({ offset: 16, closeButton: false }).setDOMContent(body))
        .addTo(map)
    })

    const line = pins.filter((p) => p.kind === 'stop').map((p) => [p.lon, p.lat])
    ;(map.getSource('route') as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: line },
    })
    if (dayColor) map.setPaintProperty('route', 'line-color', dayColor)

    if (pins.length === 1) {
      map.easeTo({ center: [pins[0].lon, pins[0].lat], zoom: 14 })
    } else if (pins.length > 1) {
      const bounds = new maplibregl.LngLatBounds()
      pins.forEach((p) => bounds.extend([p.lon, p.lat]))
      map.fitBounds(bounds, { padding: 56, maxZoom: 15, duration: 400 })
    }
  }, [option, activeDay, ready, theme])

  if (failed) {
    return (
      <div className="map map-loading">
        <p>Map unavailable on this device. The plan itself is unaffected.</p>
      </div>
    )
  }
  return <div ref={container} className={`map map-${theme}`} data-testid="map" />
}

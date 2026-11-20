import { useEffect, useState } from 'react'
import type { Photo } from '../types'
import { fetchJson } from '../api/http'
import { heroImageUrl } from '../api/photos'

/** Starting points for someone who hasn't decided yet. */
export const DESTINATIONS = [
  { query: 'Lisbon', label: 'Lisbon', country: 'Portugal', article: 'Lisbon' },
  { query: 'Kyoto', label: 'Kyoto', country: 'Japan', article: 'Kyoto' },
  { query: 'New York', label: 'New York', country: 'United States', article: 'New_York_City' },
  { query: 'Mexico City', label: 'Mexico City', country: 'Mexico', article: 'Mexico_City' },
  { query: 'Cape Town', label: 'Cape Town', country: 'South Africa', article: 'Cape_Town' },
  { query: 'Istanbul', label: 'Istanbul', country: 'Türkiye', article: 'Istanbul' },
] as const

interface Props {
  onPick: (query: string) => void
}

/** Photo tiles of a few great cities; one tap plans a trip there. */
export default function Destinations({ onPick }: Props) {
  const [photos, setPhotos] = useState<Record<string, Photo>>({})

  useEffect(() => {
    const ctrl = new AbortController()
    for (const d of DESTINATIONS) {
      fetchJson<Parameters<typeof heroImageUrl>[0] & { content_urls?: { desktop?: { page?: string } } }>(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${d.article}`,
        { timeoutMs: 8000, retries: 0, signal: ctrl.signal },
      )
        .then((s) => {
          const url = heroImageUrl(s)
          if (url) {
            setPhotos((p) => ({
              ...p,
              [d.query]: { url, pageUrl: s.content_urls?.desktop?.page ?? '' },
            }))
          }
        })
        .catch(() => {
          /* the tile keeps its colour */
        })
    }
    return () => ctrl.abort()
  }, [])

  return (
    <section className="destinations" aria-labelledby="destinations-title">
      <h2 id="destinations-title" className="destinations-title">
        Or start with a favourite
      </h2>
      <ul className="destination-grid">
        {DESTINATIONS.map((d, i) => (
          <li key={d.query}>
            <button
              className={`destination tint-${i % 6}`}
              data-testid="destination"
              onClick={() => onPick(d.query)}
            >
              {photos[d.query] && (
                <img
                  src={photos[d.query].url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                />
              )}
              <span className="destination-name">{d.label}</span>
              <span className="destination-country">{d.country}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="hint">Plans three days from next week for two people by transit. Change anything above.</p>
    </section>
  )
}

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Place } from '../types'
import { attachPhotos, fetchPhotos, heroImageUrl, parsePhotos, photoLookupUrl, photoCandidates } from './photos'
import { buildTrip } from '../planner/planner'
import { dest, request, richPool } from '../planner/testFixtures'

afterEach(() => vi.unstubAllGlobals())

const p = (name: string, over: Partial<Place> = {}): Place => ({
  id: `id-${name}`, name, kind: 'attraction', lat: 38.7098, lon: -9.1326, score: 5, indoor: false, distanceKm: 1, ...over,
})
const thumb = (file: string) => ({ source: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${file}/480px-${file}`, width: 480, height: 320 })

describe('photoLookupUrl', () => {
  it('asks Wikipedia for a thumbnail and position of each title, browser-safe', () => {
    const u = new URL(photoLookupUrl(['Lisbon Cathedral', 'São Jorge Castle']))
    expect(u.origin + u.pathname).toBe('https://en.wikipedia.org/w/api.php')
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      action: 'query', titles: 'Lisbon Cathedral|São Jorge Castle', prop: 'pageimages|coordinates',
      piprop: 'thumbnail', pithumbsize: '480', redirects: '1', format: 'json', formatversion: '2', origin: '*',
    })
  })
})

describe('photoCandidates', () => {
  it('looks up sights and parks, never restaurants, cafés or local stops', () => {
    const names = photoCandidates([
      p('Lisbon Cathedral'), p('Gulbenkian', { kind: 'museum' }), p('Estrela Garden', { kind: 'park' }),
      p('Alma', { kind: 'restaurant' }), p('Fábrica', { kind: 'cafe' }), p('Manteigaria', { kind: 'market' }),
    ]).map((x) => x.name)
    expect(names).toEqual(['Lisbon Cathedral', 'Gulbenkian', 'Estrela Garden'])
  })
  it('asks once per name', () => {
    expect(photoCandidates([p('A'), p('A', { id: 'other' })])).toHaveLength(1)
  })
})

describe('parsePhotos', () => {
  const places = [p('Lisbon Cathedral'), p('Belem Tower', { lat: 38.6916, lon: -9.216 }), p('Alma')]
  const data = {
    query: {
      normalized: [{ from: 'Belem Tower', to: 'Belem Tower' }],
      redirects: [{ from: 'Belem Tower', to: 'Belém Tower' }],
      pages: [
        { title: 'Lisbon Cathedral', thumbnail: thumb('Se.jpg'), coordinates: [{ lat: 38.7099, lon: -9.1329 }] },
        { title: 'Belém Tower', thumbnail: thumb('Belem.jpg'), coordinates: [{ lat: 38.6916, lon: -9.2160 }] },
        // A different "Alma" far away: must not be used.
        { title: 'Alma', thumbnail: thumb('Alma.jpg'), coordinates: [{ lat: 45.5, lon: -73.6 }] },
        { title: 'Missing', missing: true },
      ],
    },
  }
  const photos = parsePhotos(data, places)

  it('matches through redirects and keeps the article link for credit', () => {
    expect(photos.get('id-Belem Tower')).toEqual({
      url: thumb('Belem.jpg').source,
      pageUrl: 'https://en.wikipedia.org/wiki/Bel%C3%A9m_Tower',
    })
    expect(photos.get('id-Lisbon Cathedral')?.url).toContain('Se.jpg')
  })
  it('ignores an article about a same-named place somewhere else', () => {
    expect(photos.has('id-Alma')).toBe(false)
  })
  it('ignores articles without a position, to be safe', () => {
    const noCoords = { query: { pages: [{ title: 'Lisbon Cathedral', thumbnail: thumb('Se.jpg') }] } }
    expect(parsePhotos(noCoords, places).size).toBe(0)
  })
  it('survives an empty or malformed answer', () => {
    expect(parsePhotos({}, places).size).toBe(0)
    expect(parsePhotos(null, places).size).toBe(0)
  })
})

describe('fetchPhotos', () => {
  it('asks in batches of at most 50 titles', async () => {
    const fetchMock = vi.fn(async (url: unknown) => Response.json({ query: { pages: [] }, url: String(url) }))
    vi.stubGlobal('fetch', fetchMock)
    const many = Array.from({ length: 120 }, (_, i) => p(`Sight ${i}`))
    await fetchPhotos(many)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('titles')!.split('|')).toHaveLength(50)
  })
  it('returns what it found and never throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })))
    expect((await fetchPhotos([p('Lisbon Cathedral')])).size).toBe(0)
  })
})

describe('heroImageUrl', () => {
  it('asks Wikimedia for a 1280px rendition of a large image', () => {
    expect(
      heroImageUrl({
        thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Lisbon.jpg/320px-Lisbon.jpg', width: 320, height: 200 },
        originalimage: { source: 'https://upload.wikimedia.org/wikipedia/commons/1/1a/Lisbon.jpg', width: 4000, height: 2500 },
      }),
    ).toBe('https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Lisbon.jpg/1280px-Lisbon.jpg')
  })
  it('uses the original when it is already small', () => {
    expect(
      heroImageUrl({
        thumbnail: { source: 'https://upload.wikimedia.org/x/thumb/320px-a.jpg', width: 320, height: 200 },
        originalimage: { source: 'https://upload.wikimedia.org/x/a.jpg', width: 1100, height: 700 },
      }),
    ).toBe('https://upload.wikimedia.org/x/a.jpg')
  })
  it('has nothing for a summary without an image, or a non-Wikimedia one', () => {
    expect(heroImageUrl({})).toBeUndefined()
    expect(heroImageUrl({ originalimage: { source: 'https://evil.example/a.jpg', width: 900, height: 500 } })).toBeUndefined()
  })
})

describe('attachPhotos', () => {
  it('puts each photo on every stop of that place, in every option', () => {
    const trip = buildTrip({ request: request(), destination: dest, pool: richPool(), weatherByDate: new Map(), cityInfo: { timezone: 'UTC' } })
    const first = trip.options[0].days[0].stops[0].place
    const photo = { url: 'https://upload.wikimedia.org/a.jpg', pageUrl: 'https://en.wikipedia.org/wiki/A' }
    const withPhotos = attachPhotos(trip, new Map([[first.id, photo]]))
    const all = withPhotos.options.flatMap((o) => o.days.flatMap((d) => d.stops)).filter((s) => s.place.id === first.id)
    expect(all.length).toBeGreaterThan(0)
    for (const s of all) expect(s.place.photo).toEqual(photo)
    expect(trip.options[0].days[0].stops[0].place.photo).toBeUndefined() // original untouched
  })
})

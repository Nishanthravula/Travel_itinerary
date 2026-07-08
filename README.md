# Wayfarer — Smart Travel Itinerary Planner

A minimal, production-ready PWA that turns *destination + dates + days + flights*
into an optimized day-by-day travel plan — with weather-aware scheduling,
authentic local food picks, and offline maps.

## What it does

Give it a city, a start date, the number of days, and (optionally) your flight
times. It generates:

- **Famous places** — ranked by *global fame*: each candidate's Wikidata
  sitelink count (how many Wikipedia language editions cover it — Eiffel
  Tower ≈ 280, a random statue ≈ 2), so plans feature the places people
  actually travel for. Sights are geographically clustered so each day stays
  in one area with a walkable nearest-neighbour route.
- **Authentic restaurants & local cafés** — chain brands filtered out, local
  cuisine boosted, picked near wherever you'll be at lunch/dinner/coffee time,
  never repeated across the trip.
- **Weather forecast per day** (Open-Meteo, up to 16 days out) — and the plan
  *adapts*: outdoor-heavy days are assigned to the best-weather dates, museums
  and indoor sights absorb the rain, viewpoints get the sunset slot on clear
  evenings.
- **Flight-aware first/last days** — sightseeing starts ~2.5 h after landing
  and stops ~3.5 h before departure.
- **Suggested time to visit** every stop, with per-place notes.
- **City uniqueness & local info** — Wikipedia summary plus timezone, currency,
  languages and driving side.
- **National/state parks & nature** within ~80 km, listed with distances.
- **Offline maps** — one tap downloads the city's map tiles to the device;
  itineraries are auto-saved and readable with zero connectivity (full PWA).

## Architecture

Client-only React + TypeScript + Vite PWA. **No backend, no API keys, no
secrets** — it uses only free, keyless, CORS-enabled public APIs, so it deploys
to any static host as-is:

| Concern | Source |
|---|---|
| Geocoding + timezone | Open-Meteo Geocoding API |
| 16-day daily forecast | Open-Meteo Forecast API |
| Sights, food, cafés, parks | OpenStreetMap via Overpass API |
| Fame ranking | Wikidata SPARQL (sitelink counts) |
| City summary | Wikipedia REST API |
| Currency / languages / driving side | REST Countries |
| Map rendering | Leaflet + OSM raster tiles |

```
src/
├── api/          # thin fetch clients for the public APIs
├── planner/      # the "smart" core — pure, deterministic, unit-tested
│   ├── cluster.ts    # balanced k-means day clustering + route ordering
│   ├── schedule.ts   # slot templates, flight buffers, rainy-day logic
│   └── planner.ts    # orchestration + weather↔cluster assignment
├── offline/      # saved trips (localStorage) + tile downloader (Cache API)
└── components/   # minimal UI
```

Offline strategy (service worker via `vite-plugin-pwa`/Workbox):

- **App shell** — precached, works fully offline.
- **Map tiles** — `CacheFirst`; the *Download offline map* button prefetches
  the city area (zoom 12–15, capped at 400 tiles) into the same cache.
- **API responses** — `NetworkFirst` with cache fallback.
- **Itineraries** — auto-saved to localStorage (last 20 trips).

## Develop

```bash
npm install
npm run dev        # dev server
npm test           # planner unit tests (vitest)
npm run build      # typecheck + production build + service worker
npm run preview    # serve the production build
```

## Production notes

- The demo tile source is openstreetmap.org, which is fine for light use but
  [not for heavy production traffic](https://operations.osmfoundation.org/policies/tiles/).
  For scale, swap the tile URL in `src/components/MapView.tsx`,
  `src/offline/tiles.ts` and the pattern in `vite.config.ts` for a provider
  like MapTiler or Thunderforest (both have free tiers).
- Overpass is a shared public service; the app sends one query per plan.
  For heavy traffic, point `OVERPASS_ENDPOINT` at a commercial mirror or
  self-hosted instance.
- Weather beyond 16 days isn't forecastable; the app flags those days and
  refreshes automatically when reopened closer to departure.

## License

MIT — see [LICENSE](LICENSE).

---
name: verify
description: Build, run and drive the Wayfarer PWA end-to-end in headless Chromium to verify changes at the GUI surface.
---

# Verifying Wayfarer

## Build & serve

```bash
npm run build                      # tsc + vite build + service worker
npm run preview -- --port 4173 --strictPort   # run in background
```

Unit tests for the planner core: `npm test` (vitest, pure logic, no DOM).

## Drive the GUI

Playwright 1.56+ is installed globally in the remote env
(`/opt/node22/lib/node_modules/playwright/index.mjs`); Chromium lives in
`/opt/pw-browsers`. Import by absolute path in an .mjs script — ESM ignores
NODE_PATH.

**Gotchas learned the hard way:**

- Session egress policy blocks the third-party APIs (open-meteo, overpass,
  wikipedia, restcountries, query.wikidata.org, OSM tiles) — 403 CONNECT
  from the proxy. Verify with `context.route()` interception serving canned
  JSON payloads (see the shapes in `src/api/*.ts`). The wikidata mock must
  return SPARQL bindings `{item: {value: ".../entity/Qn"}, links: {value: "N"}}`
  — fame counts dominate ranking, so give landmarks 50–300 and filler 1–5.
- **The app registers a service worker whose fetches BYPASS Playwright
  routing.** Create the main test context with `serviceWorkers: 'block'`
  or all API mocks silently fail with `net::ERR_FAILED`.
- To test the PWA offline shell, use a *separate* context (SW allowed):
  `goto` → `navigator.serviceWorker.ready` → wait ~1.5 s for precache →
  `context.setOffline(true)` → `reload` → assert `h1` renders and
  `.offline-pill` is visible.
- Tile-cache assertions: `caches.open('osm-tiles-v1')` from page context
  (cache name is shared between vite.config.ts and src/offline/tiles.ts).

## Flows worth driving

1. Fill form (destination, days, flight times via "+ Add flight details"),
   submit, wait for `.itinerary`.
2. Assert: 3 `.day-card`s, `.day-marker`s on the map, rainy-day badge +
   "Rain likely" note, day-1 first `.stop-time` ≥ arrival+2.5 h, last-day
   final stop ends ≤ departure−3.5 h, unique restaurant names across days.
3. "Download offline map" button → wait for "✓ Offline map ready", count
   intercepted tile requests (expect ~360).
4. Reload → saved trip in `.trip-item` → click reopens from localStorage.
5. Error path: geocode mock returning `{results: []}` → `.status-card.error`.

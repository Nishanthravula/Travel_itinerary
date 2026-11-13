# Wayfarer

Plan a trip in one step. Enter **where, when, who and how**; get **three
complete plans** to compare, each with top sights, local restaurants and
places to stay.

## What it does

**You give it**

| | |
|---|---|
| Where | a city or town (suggestions tell same-named places apart) |
| When | a date range, 1–14 days |
| Who | 1–12 people |
| How | walking, public transit or car |
| Flights (optional) | landing and take-off times, so the first and last day fit around them |

**You get** up to three plans for the same destination:

| Plan | Pace | Leans toward |
|---|---|---|
| Highlights | up to 5 sights a day, 09:00–21:30 | the best-known sights, efficiently routed |
| Food & local life | up to 3 sights a day, 10:00–22:00 | long meals, a market / bakery / bar stop, neighbourhood corners |
| Easy pace | up to 3 sights a day, 10:00–20:00 | parks, museums, viewpoints, longer stays |

Each plan is a day-by-day timeline with the estimated travel time between
stops, a map, the forecast, and up to four places to stay near where that
plan spends its days.

- **Transport changes the plan.** Walking keeps days within about 5 km;
  transit covers the city; a car reaches 30 km and adds nearby nature.
  Short hops are walked whatever the mode.
- **Weather changes the plan.** Outdoor-heavy days go to the best dates,
  rainy days lead with indoor sights, a viewpoint is held for golden hour.
- **People change the stays.** Rooms and the booking link follow the party
  size; apartments rise for four or more; larger groups get a reminder to
  reserve.
- **Small towns get honest results.** If the map data cannot support three
  different plans, you get fewer, with a note saying so.
- **Trips are saved on the device** and open with no connection. A share
  link rebuilds the same trip for someone else.

### What it does not do

- **No prices, availability, photos or review scores.** Stays come from
  open map data. *Check prices* opens a booking-site search with your
  dates, guests and rooms filled in.
- **Travel times are estimates** from straight-line distance, always shown
  with "≈". There is no routing and no timetable.
- No accounts or sync between devices, no editing of a generated plan, no
  multi-city trips.

## How it is built

A client-only React + TypeScript + Vite PWA. **No backend, no API keys.**

| Concern | Source |
|---|---|
| Place search, timezone | Open-Meteo Geocoding |
| 16-day forecast | Open-Meteo Forecast |
| Sights, food, stays, parks | OpenStreetMap via Overpass (three public mirrors, tried in turn) |
| City summary | Wikipedia REST |
| Currency, languages, driving side | REST Countries |
| Map | MapLibre GL + OpenFreeMap vector tiles |

```
src/
├── planner/     the core — pure and unit-tested
│   ├── transport.ts   reach, speed and hop time per mode
│   ├── styles.ts      the three plan styles
│   ├── cluster.ts     one geographic cluster of sights per day
│   ├── schedule.ts    a day as a continuous timeline
│   ├── stays.ts       ranking stays, rooms, booking links
│   └── planner.ts     building and de-duplicating the options
├── api/         data sources behind one resilient fetch (timeout, retry, cancel)
│   └── providers.ts   the seam for a paid places/stays provider
├── offline/     saved trips (localStorage) and the places cache (IndexedDB)
├── components/  search bar, option comparison, plan view, map
├── ui/          design tokens and icons
└── share.ts     request ⇄ URL
```

Reliability: every request has a timeout and retries; places are fetched as
four small queries (sights, food, stays, parks) spread across mirrors, and a
plan still builds — with a note — if food, stays or parks cannot be loaded; a fetched city is cached for a week so re-planning
does not hit the shared service again; weather and city facts are optional
and never fail a plan.

## Develop

```bash
npm install
npm run dev          # dev server
npm test             # unit tests (Vitest)
npm run lint
npm run typecheck
npm run build        # typecheck + production build + service worker
npm run e2e          # browser smoke tests against the build, all APIs mocked
```

`npm run e2e` needs a Chromium for Playwright: `npx playwright install chromium`.

## Deploy

Any static host works. `netlify.toml` is included: build command, SPA
fallback, a content-security-policy limited to the data sources above, and
cache headers. GitHub Actions (`.github/workflows/ci.yml`) runs lint,
typecheck, unit tests, build and the smoke tests on every push and pull
request.

## Limits of the free data, and the upgrade path

- **Overpass is a shared public service.** It can be slow or rate-limited
  at busy times; the app retries on other mirrors and then offers a retry.
  For real traffic, point `OVERPASS_MIRRORS` in `src/api/overpass.ts` at a
  hosted or self-hosted instance.
- **OpenFreeMap** is free and donation-funded. The dark theme reuses the
  light map style, inverted.
- **Live prices, photos and ratings** need a paid provider and a small
  backend to keep its key secret. Implement `PlacesProvider`
  (`src/api/providers.ts`) and fill the optional `price`, `rating` and
  `photoUrl` fields on `Stay`; the stay list already shows them when
  present.

## License

MIT — see [LICENSE](LICENSE).

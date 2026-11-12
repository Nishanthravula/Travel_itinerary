# Wayfarer v2 — trip options, hotels, and a production release

Date: 2026-11-12 · Status: awaiting approval

## Intent and why

Wayfarer today turns one city + start date + day count into a single
day-by-day plan. The owner wants it to be a product people can actually use:
advanced in what it works out, minimal in how it looks. A traveller enters
**a date range, a location, the number of people, and how they will get
around**, and gets back **several complete plan options**, each with top
sights, local restaurants and places to stay. This is the first release;
upgrades follow, so the build must leave clean seams for them.

## Goals

1. New inputs: date range, destination, travellers, transport mode
   (walking / public transit / car). Flight times stay as an optional extra.
2. Output: three distinct plan options for the same destination, compared
   side by side, each openable into a full day-by-day plan with map.
3. Hotels in every option, chosen for that option's base area, with a
   "check prices" link prefilled with dates, guests and rooms.
4. A minimalist, modern interface (light and dark, phone to desktop).
5. Production basics: deployed on a public URL, automated checks on every
   change, resilient data fetching, usable offline for saved trips.

## Non-goals (this release)

- Live hotel prices, availability, photos, review scores (approach B, later).
- Accounts, cross-device sync, collaborative editing.
- Editing a generated plan (swap/reorder stops).
- Multi-city trips; suggesting destinations.
- Turn-by-turn routing or real transit timetables.

## Anti-goals

- Showing anything that looks like a real price, rating or availability
  that we do not actually have. Travel times are labelled as estimates.
- Requiring a sign-up, API key, or payment to get a plan.
- Leaning on free public services in ways their usage policies forbid
  (notably bulk-downloading OpenStreetMap's own tile servers).
- Visual clutter: emoji icons, heavy shadows, many accent colours.

## Constraints

- Client-only static app; no backend, no secrets. React 19 + TypeScript +
  Vite + vite-plugin-pwa, as today.
- Free, keyless, browser-callable data only: Open-Meteo (geocoding,
  weather), OpenStreetMap via Overpass (sights, food, hotels, parks),
  Wikipedia, REST Countries.
- The existing planner core (clustering, scheduling, weather matching) is
  kept and extended, and stays pure and unit-tested.
- Trips up to 14 days; forecast only within 16 days (existing behaviour).

## Approaches

**A. Free open data, client-only (chosen by the owner).** Hotels, sights
and food all come from OpenStreetMap. Hotels show name, type, stars where
tagged, distance from the plan's base, and link out to a booking search.
Free, no keys, deployable today. Trade-off: no prices, photos or reviews.

**B. Paid data providers behind a backend.** Live prices, photos, ratings.
Needs serverless functions, the owner's API keys, per-use cost, and partner
approval for hotel price feeds. Deferred as an upgrade.

**C. AI-written itineraries.** A language model writes the plan. Dropped
for now: needs a key and per-use cost, and invents places unless grounded
in the same data A already uses.

A is built so B can be added without rework: every data source sits behind
a small provider interface (`PlacesProvider`, `StaysProvider`), and the UI
renders optional fields (price, rating, photo) only when a provider
supplies them.

## Design

### Inputs (`TripRequest` v2)

| Field | Detail |
|---|---|
| destination | free text → geocoded; if several matches, a short picker instead of silently taking the most populous |
| startDate, endDate | date-range picker; 1–14 days; `days` derived |
| travellers | 1–12, default 2 |
| transport | `walk` \| `transit` \| `car`, default `transit` |
| flights | optional, unchanged |

### How the inputs change the plan

**Transport** sets a profile used throughout the planner:

| | walk | transit | car |
|---|---|---|---|
| sight search radius | 5 km | 12 km | 30 km |
| assumed speed (door to door) | 4.5 km/h | 16 km/h | 28 km/h |
| detour factor on straight-line distance | 1.3 | 1.4 | 1.4 |
| fixed overhead per hop | 0 min | 8 min | 10 min (parking) |
| nearby parks/nature offered as day stops | no | no | yes |

Between consecutive stops the planner computes an estimated travel time
and shifts the timeline accordingly, so a day never schedules more than
fits. Each hop is shown as "≈ 12 min walk". If a walking plan has a hop
over 30 min it is flagged with a suggestion to take transit.

**Travellers** sets rooms (`ceil(n / 2)`), the guests/rooms in booking
links, favours apartments and larger properties for 4+, and adds a
"reserve ahead for N" note on dinners for 5+. We do not claim to know
restaurant capacity.

### Three options

All three are built from one fetched pool of places, by one generalised
`buildItinerary(inputs, style)`. A style is a small config object:

| Style | Sights/day | Day window | Emphasis |
|---|---|---|---|
| **Highlights** | up to 5 | 09:00–21:30 | highest-notability sights first |
| **Food & local life** | up to 3 | 10:00–22:00 | longer lunch and dinner, extra food stop (market/bakery/bar), restaurants weighted by local cuisine, sights weighted toward neighbourhoods |
| **Easy pace** | up to 3 | 10:00–20:00 | parks, gardens, museums, viewpoints; longer stays; shortest hops |

Options must be visibly different: a sight may appear in more than one
option, but restaurant picks are not shared between options where the pool
allows, and each option gets its own base area. If the pool is too thin to
make three meaningfully different plans (small towns), show fewer options
with a one-line explanation rather than near-duplicates.

Each option carries a summary used on its card: number of sights, total
estimated travel time, share of indoor stops, three headline sights, base
neighbourhood.

### Hotels

- Overpass query adds `tourism=hotel|guest_house|hostel|apartment` (named)
  within the transport radius.
- Each option's **base** is the centroid of its stops. Stays are ranked by
  closeness to the base, then quality signals (stars tag, website,
  Wikidata, brand not penalised here).
- Show up to four per option, mixing types where available; for car plans
  prefer stays tagged with parking when the tag exists.
- Each stay shows: name, type, stars if tagged, distance from base,
  own website if tagged, and **Check prices** → a booking-site search deep
  link with destination/hotel name, check-in, check-out, adults, rooms.
  No affiliate codes. The link builder is one function so the target site
  can be changed.

### Screens

Single page, three states.

```
┌──────────────────────────────────────────────────────────────┐
│ Wayfarer                                            Saved (3) │
│                                                              │
│            Plan a trip worth taking.                         │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Where        │ When          │ Who      │ How       │ →  │ │
│ │ Lisbon       │ 12–16 Mar     │ 2 people │ Transit   │    │ │
│ └──────────────────────────────────────────────────────────┘ │
│   + flight times                                             │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Lisbon · 12–16 Mar · 2 people · Transit              Edit    │
│                                                              │
│ ┌ Highlights ──────┐ ┌ Food & local ────┐ ┌ Easy pace ─────┐ │
│ │ 22 sights        │ │ 14 sights        │ │ 13 sights      │ │
│ │ ≈ 3h 10 moving   │ │ ≈ 2h 05 moving   │ │ ≈ 1h 30 moving │ │
│ │ Belém Tower      │ │ Time Out Market  │ │ Gulbenkian     │ │
│ │ Jerónimos        │ │ Alfama           │ │ Estrela Garden │ │
│ │ Base: Baixa      │ │ Base: Alfama     │ │ Base: Avenidas │ │
│ │ View plan →      │ │ View plan →      │ │ View plan →    │ │
│ └──────────────────┘ └──────────────────┘ └────────────────┘ │
└──────────────────────────────────────────────────────────────┘

┌───────────────────────────────┬──────────────────────────────┐
│ ‹ Options   Highlights        │                              │
│ [Day 1][Day 2][Day 3][Stay]   │            map               │
│ Thu 12 Mar · 18° clear        │   (sticky on desktop,        │
│ 09:00  Belém Tower   1h45     │    collapsible on phone)     │
│   ≈ 9 min transit             │                              │
│ 11:00  Jerónimos     1h30     │                              │
│ 12:45  Lunch · Ponto Final    │                              │
└───────────────────────────────┴──────────────────────────────┘
```

- Search bar is one segmented control; each segment opens a small popover
  (place suggestions, range calendar, stepper, three-way mode toggle).
  On phones it stacks into four rows.
- Loading shows skeleton cards with the current step, not a spinner.
- Share: the request is mirrored into the URL (`?q=…&from=…&to=…&n=…&by=…`)
  so a link regenerates the same options; a Copy link button.
- Saved trips move to a quiet drawer from the header.

### Visual direction (builder's call, owner delegated)

Reference points: Linear, Airbnb search, Apple Maps cards. Near-white /
near-black surfaces, one restrained accent, hairline borders instead of
shadows, generous spacing, a single sans family with tabular numerals for
times, thin-line SVG icons in place of emoji, subtle 150 ms transitions
that respect reduced-motion. Day colours on the map are a muted categorical
set that also works in dark mode. WCAG AA contrast; full keyboard use;
visible focus rings.

### Map and offline

- Replace Leaflet + openstreetmap.org raster tiles with MapLibre GL and
  OpenFreeMap's hosted vector styles (free, keyless, production use
  permitted), light and dark styles following the theme. If that proves
  unworkable, fall back to Leaflet with the current tiles and note it.
- Remove the "Download offline map" bulk download (it conflicts with tile
  usage policy). Map data the traveller has viewed is cached by the service
  worker and remains available offline; saved trips remain fully readable
  offline. The UI says exactly this, not "offline maps".

### Reliability

- All fetches: timeout, abort on new search, up to two retries with
  backoff. Overpass rotates across public mirrors on failure.
- Place pool cached per destination + transport in IndexedDB for 7 days,
  so repeat searches and re-plans don't hit Overpass.
- Weather and city info are best-effort: failures degrade to a note, they
  never fail the plan. Only geocoding or an empty place pool is fatal, with
  a clear message and a retry.
- React error boundary with a recover action.
- Saved trips: storage key v2 holding the request plus all options;
  existing v1 trips are wrapped as a single "Highlights" option.

### Production

- `netlify.toml`: build command, SPA fallback, security headers including
  a content-security-policy limited to the data hosts above, long-cache for
  hashed assets.
- GitHub Actions on push/PR: typecheck, lint, unit tests, build, and a
  headless-browser smoke test against the built app with mocked APIs
  (search → three options → open plan → stays visible → reload → saved).
- Unit tests for every new planner behaviour: transport profiles and hop
  times, styles producing different plans, base and stay ranking, rooms and
  booking links, thin-pool fallback, v1→v2 storage migration.
- README rewritten to match. Delivered as a pull request to `main`;
  deploying to the owner's Netlify account as a new site happens after the
  owner reviews the PR.

## Left to the builder

- Component breakdown, state management (plain React state is expected to
  be enough), exact style weights and thresholds, tuned against a few real
  cities of different sizes.
- Which booking site the deep link targets and its exact parameters.
- Calendar/popover implementation (hand-rolled or a small dependency).
- Exact palette, type scale and icon set within the direction above.

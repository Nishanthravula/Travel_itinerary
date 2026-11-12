# Wayfarer v2 (trip options, hotels, production) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Wayfarer into a deployable product that takes dates, destination, travellers and transport mode and returns three comparable plan options, each with sights, restaurants and hotels.

**Architecture:** Client-only React PWA, unchanged in shape. The pure planner core is generalised by two config objects (transport profile, plan style) and gains a stays module; data sources move behind provider interfaces with a shared resilient fetch helper; the UI is rebuilt around a segmented search bar, option cards and a split timeline/map view.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7, vite-plugin-pwa, Vitest, MapLibre GL + OpenFreeMap, Playwright (smoke test), ESLint, GitHub Actions, Netlify.

**Spec:** `docs/superpowers/specs/2026-11-12-trip-options-production-design.md`

## Global Constraints

- No backend, no API keys, no secrets; only Open-Meteo, Overpass, Wikipedia, REST Countries, OpenFreeMap.
- Never display a price, rating or availability we do not have; every travel time is prefixed `≈`.
- Trips are 1–14 days; travellers 1–12 (default 2); transport `walk | transit | car` (default `transit`).
- `src/planner/**` stays pure (no fetch, no DOM, no `Date.now()` except where already present in `buildTrip` id/createdAt) and every behaviour there has a Vitest test.
- No emoji in the UI; icons are inline SVG from `src/ui/icons.tsx`.
- No bulk tile download anywhere; the phrase "offline map" does not appear in the UI.
- WCAG AA contrast, full keyboard operation, `prefers-reduced-motion` respected, light and dark themes.
- Commits end with the session's attribution trailer. Work stays on branch `claude/trip-options-production`.

## Review Focus

1. **A destination with zero stays in the data** (small towns): the Stay tab should say so and still offer one "Search stays in <city>" link, not render empty or crash. → Task 4.
2. **A malformed or stale share link** (`to` before `from`, dates in the past, `n=0`, unknown `by`): the form should open with corrected/default values and not auto-run a broken search. → Task 6.
3. **Overpass slow, rate-limited (429) or returning HTML**: the user should see the step, an automatic retry on a mirror, then a clear retry button; never an unhandled JSON parse error. → Task 5.
4. **A one-day trip, or one where flights leave no usable window**: options should still render, with the day shown as a travel day and hotel checkout set to the next day. → Tasks 2 and 4.
5. **Places and cities whose names are not Latin script**: prefer `name:en` when present, fall back to `name`; geocoder picker must show country and region so the user can tell matches apart. → Task 5.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/types.ts` (modify) | v2 domain types |
| `src/planner/transport.ts` (create) | transport profiles, hop-time estimate |
| `src/planner/styles.ts` (create) | the three plan styles |
| `src/planner/schedule.ts` (modify) | travel-time-aware, style-aware day scheduling |
| `src/planner/planner.ts` (modify) | `buildOption`, `buildTrip`, distinctness, thin-pool fallback |
| `src/planner/stays.ts` (create) | rooms, base, stay ranking, booking link |
| `src/planner/*.test.ts` | one test file per planner module (split the existing file) |
| `src/api/http.ts` (create) | `fetchJson` with timeout, retry, abort |
| `src/api/providers.ts` (create) | `PlacesProvider`, `StaysProvider` interfaces |
| `src/api/overpass.ts` (replaces `places.ts`) | Overpass implementation of both providers |
| `src/api/geocode.ts` (modify) | `searchDestinations` returning candidates |
| `src/offline/poolCache.ts` (create) | IndexedDB place-pool cache, 7-day TTL |
| `src/offline/storage.ts` (modify) | v2 saved trips + v1 migration |
| `src/offline/tiles.ts` (delete) | bulk tile download removed |
| `src/share.ts` (create) | request ⇄ URL params |
| `src/ui/tokens.css`, `src/ui/icons.tsx` (create) | design tokens, icon set |
| `src/components/SearchBar/*` (create) | segmented search + four popovers |
| `src/components/OptionCards.tsx`, `PlanView.tsx`, `DayTimeline.tsx`, `StayList.tsx`, `SavedDrawer.tsx`, `ErrorBoundary.tsx`, `Skeleton.tsx` (create) | result screens |
| `src/components/MapView.tsx` (rewrite) | MapLibre map |
| `src/App.tsx`, `src/styles.css` (rewrite) | orchestration, layout |
| `netlify.toml`, `.github/workflows/ci.yml`, `eslint.config.js`, `e2e/smoke.spec.ts`, `e2e/fixtures/*.json`, `playwright.config.ts` (create) | production |

---

### Task 1: v2 types and transport profiles

**Files:** Modify `src/types.ts`; create `src/planner/transport.ts`, `src/planner/transport.test.ts`.

**Interfaces — Produces:**
```ts
export type TransportMode = 'walk' | 'transit' | 'car'
export type StyleId = 'highlights' | 'food' | 'easy'
export type StayType = 'hotel' | 'guest_house' | 'hostel' | 'apartment'
export interface TripRequest { destinationQuery: string; startDate: string; endDate: string;
  days: number; travellers: number; transport: TransportMode; flights: FlightDetails }
export interface Stay extends GeoPoint { id: string; name: string; type: StayType;
  stars?: number; website?: string; parking?: boolean; score: number;
  price?: string; rating?: number; photoUrl?: string }   // optional = future providers
export interface RankedStay extends Stay { distanceFromBaseKm: number; bookingUrl: string }
export interface ItineraryStop { /* existing */ travelFromPrevMin?: number }
export interface OptionSummary { sightCount: number; travelMin: number; indoorShare: number;
  headlineSights: string[]; baseLabel: string }
export interface PlanOption { style: StyleId; title: string; tagline: string;
  days: ItineraryDay[]; base: GeoPoint; stays: RankedStay[]; summary: OptionSummary }
export interface Trip { id: string; createdAt: string; request: TripRequest;
  destination: Destination; cityInfo: CityInfo; options: PlanOption[];
  parks: Place[]; forecastPartial: boolean; notice?: string }
export const daysBetweenInclusive: (startISO: string, endISO: string) => number
// transport.ts
export interface TransportProfile { radiusKm: number; speedKmh: number; detour: number;
  overheadMin: number; includeNature: boolean; label: string; verb: string }
export const TRANSPORT: Record<TransportMode, TransportProfile>
export function hopMinutes(a: GeoPoint, b: GeoPoint, mode: TransportMode): number
```
The old `Itinerary` type is kept, renamed `LegacyItinerary`, for migration only.

- [ ] **Step 1: Write failing tests** in `transport.test.ts`:
```ts
expect(TRANSPORT.walk).toMatchObject({ radiusKm: 5, speedKmh: 4.5, detour: 1.3, overheadMin: 0, includeNature: false })
expect(TRANSPORT.transit).toMatchObject({ radiusKm: 12, speedKmh: 16, detour: 1.4, overheadMin: 8 })
expect(TRANSPORT.car).toMatchObject({ radiusKm: 30, speedKmh: 28, detour: 1.4, overheadMin: 10, includeNature: true })
// two points 1 km apart: walk = round(1*1.3/4.5*60) = 17; transit = 8 + round(1*1.4/16*60) = 13
expect(hopMinutes(a, b, 'walk')).toBe(17); expect(hopMinutes(a, b, 'transit')).toBe(13)
expect(hopMinutes(a, a, 'car')).toBe(0)            // same place: no overhead
expect(daysBetweenInclusive('2027-03-12', '2027-03-16')).toBe(5)
expect(daysBetweenInclusive('2027-03-28', '2027-03-29')).toBe(2)   // across a DST change
```
- [ ] **Step 2:** `npm install && npx vitest run src/planner/transport.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement types and `transport.ts`. `hopMinutes` rounds to whole minutes; returns 0 when distance < 50 m. Date maths in UTC as `addDaysISO` already does.
- [ ] **Step 4:** Tests pass; `npm run typecheck` will fail in UI files that use old types — expected until Task 8; planner tests must pass.
- [ ] **Step 5:** Commit `feat: v2 trip types and transport profiles`.

### Task 2: Style- and travel-aware day scheduling

**Files:** Create `src/planner/styles.ts`, `src/planner/schedule.test.ts`; modify `src/planner/schedule.ts`; move the existing `scheduleDay` tests out of `planner.test.ts`.

**Interfaces — Consumes:** Task 1. **Produces:**
```ts
export interface PlanStyle { id: StyleId; title: string; tagline: string; sightsPerDay: number;
  dayStart: string; dayEnd: string; sightStayMin: number; mealMin: number;
  extraFoodStop: boolean;
  sightWeight: (p: Place) => number }      // added to p.score when choosing candidates
export const STYLES: Record<StyleId, PlanStyle>
// highlights: 5, 09:00–21:30, stay 95, meal 80, no extra, weight 0
// food:       3, 10:00–22:00, stay 90, meal 105, extra food stop, weight +2 for attraction without wikipedia tag (neighbourhood spots), +0 otherwise
// easy:       3, 10:00–20:00, stay 120, meal 90, no extra, weight +3 park/museum/viewpoint
export interface DayInputs { /* existing, plus */ style: PlanStyle; transport: TransportMode; markets?: Place[] }
```
`scheduleDay` builds the day sequentially instead of from fixed clock slots: start at `max(notBefore, style.dayStart)`; alternate sights with lunch (first slot starting ≥ 12:15), café (≥ 15:30, skipped for `easy` if it would push dinner past `dayEnd`), dinner (≥ 19:00), sunset viewpoint as today; before each stop add `hopMinutes` from the previous stop and store it in `travelFromPrevMin`; round start times to 5 min; stop adding when a stop would end after `min(notAfter, style.dayEnd)`. Existing rainy-day ordering, restaurant de-duplication via `usedIds`, and notes are preserved. If any walking hop > 30 min, push the note `Long walk between <A> and <B> (≈ N min) — consider transit for this leg.`

- [ ] **Step 1: Failing tests** (fixtures: 6 sights ~800 m apart, 10 restaurants, 5 cafés):
```ts
// highlights/transit full day: ≤5 sights, has lunch and dinner, strictly increasing start times,
// every stop after the first has travelFromPrevMin ≥ 0 and start ≥ prev.start + prev.duration + travelFromPrevMin
// easy: sights ≤ 3, first start ≥ 600, last end ≤ 1200
// food: two meals each durationMin === 105 and one extra stop from `markets` when provided
// car vs walk with sights 6 km apart: walk schedules fewer sights than car
// walk with a 3 km hop: notes contain 'consider transit'
// notBefore 1140 & notAfter 1150 (no window): stops === [] and no throw      (Review Focus 4)
// existing behaviours: arrival buffer, departure cut-off, rainy indoor-first, no repeated restaurant
```
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `npx vitest run src/planner` → PASS. **Step 5:** Commit `feat: style- and travel-aware scheduling`.

### Task 3: Three options from one pool

**Files:** Modify `src/planner/planner.ts`; rewrite `src/planner/planner.test.ts`.

**Interfaces — Consumes:** Tasks 1–2; `PlacePool` (Task 5 extends it with `markets: Place[]` and `stays: Stay[]`; define the fields here as optional-safe). **Produces:**
```ts
export interface PlannerInputs { request: TripRequest; destination: Destination; pool: PlacePool;
  weatherByDate: Map<string, DayWeather>; cityInfo: CityInfo }
export function buildOption(inputs: PlannerInputs, style: PlanStyle, avoidFoodIds: Set<string>): PlanOption   // stays: [] here; Task 4 fills
export function buildTrip(inputs: PlannerInputs): Trip
export function optionOverlap(a: PlanOption, b: PlanOption): number   // Jaccard over sight ids, 0–1
```
`buildOption`: candidates = sights sorted by `score + style.sightWeight(p)` limited to `days * style.sightsPerDay`; for `car` add `pool.nationalParks` within 30 km as candidates; cluster, weather-match and schedule as today; `base` = centroid of all scheduled stops (destination centre if none); `summary.baseLabel` = name of the highest-scored sight within 1 km of base, formatted `near <name>`, else `Central <city>`; `headlineSights` = top 3 scheduled sights by score. `avoidFoodIds` seeds `usedIds` and is extended with this option's picks, so later options get different restaurants while the pool allows.
`buildTrip`: build highlights → food → easy. Thin-pool rule: drop an option when `optionOverlap` with an already-kept option > 0.8 or it has fewer than `days` sights; if any were dropped set `notice` to `Only N distinct plan(s) — there isn't enough mapped data around <city> for more.` Always keep at least highlights.

- [ ] **Step 1: Failing tests:**
```ts
// rich pool (40 sights, 30 restaurants): 3 options with styles ['highlights','food','easy']
// highlights.summary.sightCount > easy.summary.sightCount
// no restaurant id appears in two options
// optionOverlap(highlights, easy) < 0.8
// thin pool (4 sights), 3 days: options.length === 1 and notice matches /Only 1 distinct plan/
// each option.days.length === request.days, consecutive dates from request.startDate
// 1-day trip builds without throwing; forecastPartial and weather assignment tests carried over
// car request includes a nationalPark stop when one is 20 km away; walk request does not
```
- [ ] **Steps 2–5:** fail → implement → pass → commit `feat: build three distinct plan options`.

### Task 4: Stays

**Files:** Create `src/planner/stays.ts`, `src/planner/stays.test.ts`; modify `planner.ts` to call `rankStays` per option.

**Interfaces — Produces:**
```ts
export const roomsFor: (travellers: number) => number                       // ceil(n/2)
export function bookingUrl(query: string, request: TripRequest): string
export function rankStays(stays: Stay[], base: GeoPoint, request: TripRequest, cityName: string): RankedStay[]  // max 4
export function citySearchUrl(cityName: string, request: TripRequest): string
```
`bookingUrl` → `https://www.booking.com/searchresults.html` with params `ss`, `checkin`, `checkout`, `group_adults`, `no_rooms`, `group_children=0`. `checkout` = `endDate` when `days > 1`, else `startDate + 1 day`. Ranking score = `stay.score − 1.5 × distanceKm`, plus `+2` for `apartment` or `stars ≥ 4` when travellers ≥ 4, plus `+1.5` for `parking` when transport is `car`; then pick top 4 while allowing at most 2 of the same `type` if other types exist. `ss` for a stay = `"<stay name>, <city>"`.

- [ ] **Step 1: Failing tests:**
```ts
expect([1,2,3,5,12].map(roomsFor)).toEqual([1,1,2,3,6])
const u = new URL(bookingUrl('Hotel Avenida, Lisbon', req)) // 2027-03-12..16, 3 travellers
expect(Object.fromEntries(u.searchParams)).toMatchObject({ ss: 'Hotel Avenida, Lisbon',
  checkin: '2027-03-12', checkout: '2027-03-16', group_adults: '3', no_rooms: '2' })
// 1-day trip 2027-03-12: checkout === '2027-03-13'                          (Review Focus 4)
// nearer stay outranks an equal-score farther one; result length ≤ 4; ≤ 2 hostels when hotels exist
// travellers=4 lifts an apartment above an equal hotel; car lifts parking:true
// rankStays([], …) returns [] and citySearchUrl has ss === 'Lisbon'          (Review Focus 1)
// buildTrip: each option's stays are sorted by distance to that option's base, and differ when bases differ
```
- [ ] **Steps 2–5:** fail → implement → pass → commit `feat: stay ranking and booking links`.

### Task 5: Resilient data layer and providers

**Files:** Create `src/api/http.ts`, `src/api/http.test.ts`, `src/api/providers.ts`, `src/api/overpass.ts`, `src/api/overpass.test.ts`; delete `src/api/places.ts`; modify `geocode.ts`, `weather.ts`, `cityInfo.ts`.

**Interfaces — Produces:**
```ts
export class HttpError extends Error { status?: number; kind: 'timeout'|'network'|'http'|'parse' }
export function fetchJson<T>(url: string | URL, opts?: { init?: RequestInit; timeoutMs?: number;
  retries?: number; signal?: AbortSignal }): Promise<T>     // defaults 12000 ms, 2 retries, backoff 600 ms × 2^n; retries on timeout/network/429/5xx/parse
export interface PlacePool { sights: Place[]; restaurants: Place[]; cafes: Place[]; markets: Place[];
  parks: Place[]; nationalParks: Place[]; stays: Stay[] }
export interface PlacesProvider { fetchPool(dest: Destination, mode: TransportMode, signal?: AbortSignal): Promise<PlacePool> }
export const overpassProvider: PlacesProvider
export const OVERPASS_MIRRORS: string[]   // overpass-api.de, overpass.kumi.systems, overpass.private.coffee
export function parseOverpass(elements: OverpassElement[], dest: Destination): PlacePool   // pure, tested
export function searchDestinations(query: string, signal?: AbortSignal): Promise<Destination[]>  // up to 5, population-desc
```
Overpass query radius = `TRANSPORT[mode].radiusKm` for sights/food/stays (food and stays capped at 12 km even for car); adds `tourism~hotel|guest_house|hostel|apartment` (named, `out center 150`) and `amenity=marketplace|bar|pub`+`shop=bakery` (named) as `markets`. Stay `score`: +3 wikidata, +1 website, +stars (parsed number), +0.5 `internet_access`. `parking` true when `parking` tag present and not `no`. Display name = `tags['name:en'] ?? tags.name`. Mirror rotation: each retry uses the next mirror. `fetchTripWeather` and `fetchCityInfo` never throw (return empty map / `{ timezone }`).

- [ ] **Step 1: Failing tests** (Vitest with `vi.stubGlobal('fetch', …)` and fake timers):
```ts
// fetchJson: resolves JSON; 429 then 200 → resolves after 1 retry; HTML body with 200 → retries then HttpError kind 'parse'  (Review Focus 3)
// never-resolving fetch → HttpError kind 'timeout' after timeoutMs; aborted signal → rejects AbortError without retry
// parseOverpass: classifies hotel/hostel/apartment into stays with stars and parking; uses name:en over name  (Review Focus 5)
// de-duplicates way+node of the same name; chain-brand restaurant scores below a local one (existing rule kept)
// overpassProvider: first mirror 504 → second mirror called with the same body
// searchDestinations: empty results → []; results carry country and admin1
```
- [ ] **Steps 2–5:** fail → implement → pass → commit `feat: resilient fetch, provider interfaces, hotels from Overpass`.

### Task 6: Persistence and share links

**Files:** Create `src/offline/poolCache.ts`, `src/share.ts`, `src/share.test.ts`, `src/offline/storage.test.ts`; modify `src/offline/storage.ts`; add dev dependency `fake-indexeddb`.

**Interfaces — Produces:**
```ts
export function getCachedPool(key: string): Promise<PlacePool | null>   // key `${lat.toFixed(3)},${lon.toFixed(3)}:${mode}`; TTL 7 days
export function putCachedPool(key: string, pool: PlacePool): Promise<void>   // both swallow IndexedDB errors
export function loadTrips(): Trip[]; saveTrip(t: Trip): Trip[]; deleteTrip(id: string): Trip[]   // key 'wayfarer.trips.v2', cap 20
export function migrateLegacy(i: LegacyItinerary): Trip     // one 'highlights' option, travellers 2, transport 'transit', stays []
export function requestToParams(r: TripRequest): URLSearchParams      // q, from, to, n, by
export function paramsToRequest(p: URLSearchParams, todayISO: string): { request: Partial<TripRequest>; runnable: boolean }
```
`loadTrips` migrates `wayfarer.trips.v1` once if v2 is absent, and catches quota errors on save by dropping the oldest trip and retrying once.

- [ ] **Step 1: Failing tests:**
```ts
// round trip: paramsToRequest(requestToParams(r)) deep-equals r's shareable fields, runnable true
// to < from → to = from, runnable false; from in the past → runnable false; n=0 → 2; n=99 → 12; by='boat' → 'transit'   (Review Focus 2)
// range > 14 days → to clamped to from + 13
// migrateLegacy keeps days/stops and yields options.length === 1; loadTrips reads v1 data when v2 missing
// pool cache: put then get returns pool; entry older than 7 days returns null
```
- [ ] **Steps 2–5:** fail → implement → pass → commit `feat: pool cache, v2 saved trips, share links`.

### Task 7: Design system and search bar

**Files:** Create `src/ui/tokens.css`, `src/ui/icons.tsx`, `src/components/SearchBar/{SearchBar,DestinationField,DateRangeField,TravellersField,TransportField,Popover}.tsx`, `src/components/SearchBar/dateRange.ts` + test; delete `src/components/TripForm.tsx`. Load the `frontend-design` skill before starting this task.

**Interfaces — Consumes:** `searchDestinations`, `TripRequest`. **Produces:**
```tsx
<SearchBar initial={Partial<TripRequest>} busy={boolean} onSubmit={(r: TripRequest, picked?: Destination) => void} />
// dateRange.ts
export function monthGrid(year: number, month: number): (string | null)[]   // ISO dates, Monday-first, null padding
export function clampRange(from: string, to: string, todayISO: string): { from: string; to: string }  // ≥ today, 1–14 days
```
Tokens: neutral surfaces (`#fafafa`/`#0b0b0c`), text, muted, hairline border, one accent, radius 14px, 4-px spacing scale, font stack `Inter, ui-sans-serif, system-ui`, `font-variant-numeric: tabular-nums` for times; dark values under `prefers-color-scheme` and a `data-theme` override. Icons: search, calendar, users, walk, transit, car, bed, utensils, coffee, landmark, tree, sun/cloud/rain, arrow, link, x, bookmark — 1.5 px stroke, `currentColor`.
Behaviour: one pill with four segments and a submit button; each segment is a button opening a `Popover` (role `dialog`, focus trapped, Esc closes, returns focus). Destination: debounced 250 ms suggestions showing `name — region, country`; choosing one passes `picked`. Dates: two-month range calendar (one on phones), arrow-key navigation. Travellers: stepper 1–12. Transport: three-way radio group. Flight times behind a `+ flight times` disclosure, unchanged fields. Below 640 px the segments stack as rows.

- [ ] **Step 1: Failing tests** for `dateRange.ts`: March 2027 grid starts with `'2027-03-01'` at index 0 (a Monday) and has 31 dates; `clampRange('2027-03-01','2027-03-30', today)` → `to === '2027-03-14'`; from before today → today.
- [ ] **Step 2:** fail. **Step 3:** implement tokens, icons, components. **Step 4:** unit tests pass; `npm run dev` and check with keyboard only: tab through four segments, pick a date range with arrows, submit with Enter.
- [ ] **Step 5:** Commit `feat: design tokens and segmented search bar`.

### Task 8: Result screens and app wiring

**Files:** Create `OptionCards.tsx`, `PlanView.tsx`, `DayTimeline.tsx`, `StayList.tsx`, `SavedDrawer.tsx`, `ErrorBoundary.tsx`, `Skeleton.tsx`; rewrite `src/App.tsx`, `src/styles.css`, `src/main.tsx`; delete `ItineraryView.tsx`, `DayCard.tsx`, `SavedTrips.tsx`; keep and restyle `CityOverview.tsx`, `WeatherBadge.tsx`.

**Interfaces — Consumes:** everything above. **Produces:** `src/usePlanTrip.ts`:
```ts
type PlanState = { phase: 'idle' } | { phase: 'loading'; step: string } | { phase: 'error'; message: string; retry: () => void } | { phase: 'ready'; trip: Trip }
export function usePlanTrip(): { state: PlanState; plan: (r: TripRequest, picked?: Destination) => void; open: (t: Trip) => void; reset: () => void }
```
`plan` aborts any in-flight run, geocodes (uses `picked` if given; if absent and >1 candidates differ in country/region, takes the top one and sets a `notice` offering the others), reads the pool cache before calling `overpassProvider`, fetches weather and city info in parallel, calls `buildTrip`, saves, and writes `requestToParams` to the URL with `history.replaceState`. On load, if `paramsToRequest(...).runnable`, plan automatically; otherwise prefill only.
Screens per the spec sketches: summary line with Edit; option cards (title, tagline, `N sights`, `≈ Hh MM moving`, three headline sights, base label, `View plan`); `PlanView` with `‹ Options`, option switcher, tabs `Day 1…n` + `Stay`, sticky map right on ≥ 960 px and a collapsible map on top below; `DayTimeline` shows time, name, duration, note, and between stops `≈ N min <verb>`; `StayList` rows with type, stars, `≈ X km from base`, `Website`, `Check prices`, the line `Prices and availability are shown on the booking site.`, and the empty state from Review Focus 1; `trip.notice` shown above the cards; Copy link button with a confirmation toast; saved trips in a right-hand drawer; skeleton cards with the current step while loading; error card with Retry.
Stable hooks for tests: `data-testid` = `search-submit`, `option-card`, `plan-view`, `day-tab`, `stay-tab`, `stay-row`, `stop`, `hop`, `saved-open`, `saved-item`, `error-card`.

- [ ] **Step 1:** Implement hook, components, styles. **Step 2:** `npm run typecheck && npm test` → PASS (first point where the whole repo typechecks).
- [ ] **Step 3:** `npm run build && npm run preview`; with the mocked-API harness from Task 10's fixtures (write the fixtures now), drive: search → 3 cards → open plan → Stay tab → reload → saved drawer reopens it. Check at 390 px and 1280 px, light and dark; fix overflow and contrast issues.
- [ ] **Step 4:** Commit `feat: option cards, plan view, stays and saved drawer`.

### Task 9: Map on MapLibre + OpenFreeMap; remove bulk download

**Files:** Rewrite `src/components/MapView.tsx`; delete `src/offline/tiles.ts`; modify `vite.config.ts`, `package.json` (remove `leaflet`, `@types/leaflet`; add `maplibre-gl`).

**Interfaces — Produces:** `<MapView option={PlanOption} activeDay={number | 'stay'} theme={'light'|'dark'} />`, lazily loaded with `React.lazy`.
Styles `https://tiles.openfreemap.org/styles/positron` (light) and `…/dark` (dark). Numbered circular markers per stop for the active day, a thin line connecting them in order, stay markers on the Stay tab, base marker always; fit bounds on change; attribution control kept. Service worker: remove the `tile.openstreetmap.org` rule; add `CacheFirst` for `tiles.openfreemap.org` (max 3000 entries, 30 days); extend the API `NetworkFirst` rule with the two extra Overpass mirrors. If MapLibre fails to initialise (no WebGL), render a plain list fallback titled `Map unavailable on this device`.
**Fallback decision:** if OpenFreeMap styles cannot be loaded from the deployed site, revert this task to Leaflet with the previous tile URL and record it in the README; do not reinstate bulk download.

- [ ] **Step 1:** Implement. **Step 2:** `npm run build`; confirm `grep -ri "offline map\|tile.openstreetmap" src dist` returns nothing and the main JS chunk does not contain maplibre (separate chunk).
- [ ] **Step 3:** In preview with tile requests mocked, markers count equals the active day's stops and switching day tabs updates them.
- [ ] **Step 4:** Commit `feat: MapLibre map on OpenFreeMap; drop bulk tile download`.

### Task 10: Production hardening and release

**Files:** Create `netlify.toml`, `.github/workflows/ci.yml`, `eslint.config.js`, `playwright.config.ts`, `e2e/smoke.spec.ts`, `e2e/fixtures/{geocode,overpass,weather,wiki,country}.json`; modify `package.json` scripts (`lint`, `e2e`), `index.html` (meta description, theme-color for both schemes), `README.md`, `.claude/skills/verify/SKILL.md`.

`netlify.toml`: `command = "npm run build"`, `publish = "dist"`, Node 22, `/* → /index.html 200`, headers: `Content-Security-Policy` with `default-src 'self'`; `connect-src` listing the Open-Meteo hosts, three Overpass mirrors, `en.wikipedia.org`, `restcountries.com`, `tiles.openfreemap.org`; `img-src 'self' data: blob: https://tiles.openfreemap.org`; `worker-src 'self' blob:`; `style-src 'self' 'unsafe-inline'`; plus `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=()`; `/assets/*` → `Cache-Control: public, max-age=31536000, immutable`; `/sw.js` → `no-cache`.
CI: on push and pull_request — `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npx playwright install --with-deps chromium`, `npm run e2e`.

- [ ] **Step 1: Write the smoke test** (context with `serviceWorkers: 'block'`, all third-party hosts routed to fixtures):
```ts
// fill Where 'Lisbon', pick first suggestion, choose a 3-day range, travellers 3, Car → submit
// expect 3 [data-testid=option-card]; open the first → [data-testid=stop] count > 5 and ≥ 1 [data-testid=hop] containing '≈'
// Stay tab → ≥ 1 stay-row whose 'Check prices' href contains 'group_adults=3' and 'no_rooms=2'
// URL contains 'by=car'; reload → options render again from the URL
// saved drawer lists the trip; second test: Overpass fixture replaced by 504 on all mirrors → error-card with a Retry button
// third test: geocode returns {results: []} → error-card mentioning the query
```
- [ ] **Step 2:** `npm run build && npm run e2e` → fix until PASS. **Step 3:** `npm run lint` clean.
- [ ] **Step 4:** Rewrite README (what it does, inputs/outputs, data sources and their limits, develop/test/deploy, upgrade path to paid providers via `src/api/providers.ts`); update the verify skill's flows and selectors.
- [ ] **Step 5:** Commit `chore: Netlify config, CI, smoke tests, docs`; push the branch with `git -c push.negotiate=true push -u origin claude/trip-options-production`; open a pull request to `main` summarising the change and listing what is intentionally not included. Deployment to Netlify waits for the owner's go-ahead on the PR.

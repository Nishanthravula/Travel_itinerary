---
name: verify
description: Build, test and drive the Wayfarer PWA end-to-end in headless Chromium to verify changes at the GUI surface.
---

# Verifying Wayfarer

```bash
npm run lint && npm run typecheck && npm test   # static checks + unit tests
npm run build                                    # tsc + vite build + service worker
npm run e2e                                      # Playwright smoke tests (starts `vite preview` itself)
```

## How the browser tests work

- `e2e/mocks.ts` serves every third-party API from `e2e/fixtures/*.json`
  (a Lisbon data set). Session egress usually blocks the real hosts, and
  tests must not depend on live data anyway.
- The Playwright config sets `serviceWorkers: 'block'`: the service
  worker's own fetches bypass request mocking, so with it enabled the mocks
  silently fail.
- Map tiles are mocked with an empty style, so the map initialises but
  draws nothing. Pins are DOM elements (`.pin`) and can be asserted.
- Stable hooks: `data-testid` = `search-submit`, `option-card`,
  `plan-view`, `day-tab`, `stay-tab`, `stay-row`, `stop`, `hop`,
  `saved-open`, `saved-item`, `error-card`, `map`.

## Flows the smoke tests cover

1. Search (suggestion, date range, people, transport) → three option cards.
2. Open a plan → timeline with `≈` hops, rainy-day note, Stay tab whose
   *Check prices* link carries dates, guests and rooms.
3. Reload → share link rebuilds from the cached places (one Overpass call).
4. Places service down on all mirrors → error card with *Try again*.
5. Unknown destination → error naming it. Broken share link → prefill only.
6. Search bar operated from the keyboard alone.

## Looking at it

For a visual check, write a throwaway spec that calls `mockApis(context)`,
loads `/?q=Lisbon&from=<date>&to=<date>&n=3&by=transit` and screenshots at
1280 px and 390 px in `colorScheme: 'light'` and `'dark'`.

## Not verifiable offline

The real map (OpenFreeMap) and the content-security-policy in
`netlify.toml` can only be checked on a deployed preview: open a plan,
confirm the map draws and the console shows no CSP violations.

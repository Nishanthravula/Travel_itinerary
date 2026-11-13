import { expect, test, type Page } from '@playwright/test'
import { mockApis } from './mocks'

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const inDays = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return iso(d)
}

async function search(page: Page) {
  await page.goto('/')
  await page.getByRole('combobox', { name: 'Where' }).fill('Lisbon')
  await page.getByRole('option', { name: /Lisbon.*Portugal/ }).click()

  await page.getByRole('button', { name: /^When/ }).click()
  const dates = page.getByRole('dialog', { name: 'Trip dates' })
  await dates.locator(`[data-date="${inDays(3)}"]`).click()
  await dates.locator(`[data-date="${inDays(5)}"]`).click()
  await expect(dates).toBeHidden()

  await page.getByRole('button', { name: /^Who/ }).click()
  await page.getByRole('button', { name: 'More people' }).click()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: /^How/ }).click()
  await page.getByRole('radio', { name: /Car/ }).click()

  await page.getByTestId('search-submit').click()
}

test('plans a trip: three options, a timeline, stays, share link and saved trip', async ({
  page,
  context,
}) => {
  const calls = await mockApis(context)
  await search(page)

  await expect(page.getByTestId('option-card')).toHaveCount(3)
  await expect(page.getByRole('heading', { name: 'Lisbon, Portugal' })).toBeVisible()
  await expect(page).toHaveURL(/by=car/)
  await expect(page).toHaveURL(/n=3/)

  await page.getByTestId('option-card').first().getByRole('button', { name: /View plan/ }).click()
  await expect(page.getByTestId('plan-view')).toBeVisible()
  await expect(page.getByTestId('day-tab')).toHaveCount(3)
  expect(await page.getByTestId('stop').count()).toBeGreaterThan(5)
  await expect(page.getByTestId('hop').first()).toContainText('≈')

  // Day 2 is the rainy day in the fixture forecast.
  await page.getByTestId('day-tab').nth(1).click()
  await expect(page.getByText(/Rain likely/)).toBeVisible()

  await page.getByTestId('stay-tab').click()
  const firstStay = page.getByTestId('stay-row').first()
  await expect(firstStay).toBeVisible()
  const href = await firstStay.getByRole('link', { name: /Check prices/ }).getAttribute('href')
  expect(href).toContain('group_adults=3')
  expect(href).toContain('no_rooms=2')
  expect(href).toContain(`checkin=${inDays(3)}`)
  await expect(page.getByText(/\$|€\s?\d/)).toHaveCount(0) // never a price of our own

  // The share link rebuilds the same trip, from the cached places.
  await page.reload()
  await expect(page.getByTestId('option-card')).toHaveCount(3)
  expect(calls.overpass).toBe(4) // sights, food, stays, parks — once each, then cached

  await page.getByTestId('saved-open').click()
  await expect(page.getByTestId('saved-item').first()).toContainText('Lisbon')
})

test('explains itself and offers a retry when the places service is down', async ({
  page,
  context,
}) => {
  const calls = await mockApis(context, { placesDown: true })
  await page.goto(`/?q=Lisbon&from=${inDays(3)}&to=${inDays(4)}&n=2&by=walk`)
  const error = page.getByTestId('error-card')
  await expect(error).toBeVisible({ timeout: 20_000 })
  await expect(error).toContainText(/places service/)
  await expect(error.getByRole('button', { name: 'Try again' })).toBeVisible()
  expect(calls.overpass).toBe(12) // four parts, one attempt per mirror each
})

test('says so when the destination cannot be found', async ({ page, context }) => {
  await mockApis(context, { noSuchPlace: true })
  await page.goto('/')
  await page.getByRole('combobox', { name: 'Where' }).fill('Zzyzxville')
  await page.getByTestId('search-submit').click()
  await expect(page.getByTestId('error-card')).toContainText('Zzyzxville')
})

test('a broken share link only prefills the form', async ({ page, context }) => {
  const calls = await mockApis(context)
  await page.goto('/?q=Lisbon&from=2020-01-05&to=2020-01-01&n=0&by=boat')
  await expect(page.getByRole('combobox', { name: 'Where' })).toHaveValue('Lisbon')
  await expect(page.getByRole('button', { name: /^Who/ })).toContainText('2 people')
  await expect(page.getByRole('button', { name: /^How/ })).toContainText('Transit')
  await expect(page.getByTestId('option-card')).toHaveCount(0)
  expect(calls.overpass).toBe(0)
})

test('the search bar works from the keyboard alone', async ({ page, context }) => {
  await mockApis(context)
  await page.goto('/')
  const where = page.getByRole('combobox', { name: 'Where' })
  await where.focus()
  await page.keyboard.type('Lisbon')
  await expect(page.getByRole('option').first()).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab') // When
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Trip dates' })).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter') // first day
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter') // last day closes the calendar
  await expect(page.getByRole('dialog', { name: 'Trip dates' })).toBeHidden()
  await expect(page.getByRole('button', { name: /^When/ })).toBeFocused()
  await where.focus()
  await page.keyboard.press('Enter') // submit the form
  await expect(page.getByTestId('option-card')).toHaveCount(3)
})

test('opening a saved single-plan trip while viewing the third option does not crash', async ({
  page,
  context,
}) => {
  await mockApis(context)
  // A trip saved by v1 of the app: it migrates to one option, with no flights.
  await context.addInitScript(() => {
    if (localStorage.getItem('wayfarer.trips.v1')) return
    localStorage.setItem(
      'wayfarer.trips.v1',
      JSON.stringify([
        {
          id: 'Kyoto-old',
          createdAt: '2026-07-01T00:00:00.000Z',
          request: { destinationQuery: 'Kyoto', startDate: '2026-08-01', days: 1, flights: {} },
          destination: { name: 'Kyoto', lat: 35.01, lon: 135.77, country: 'Japan', countryCode: 'JP', timezone: 'Asia/Tokyo' },
          cityInfo: { timezone: 'Asia/Tokyo' },
          days: [{ date: '2026-08-01', label: 'Day 1', notes: [], stops: [
            { place: { id: 'node/1', name: 'Kinkaku-ji', kind: 'attraction', lat: 35.04, lon: 135.73, score: 9, indoor: false, distanceKm: 4 }, startMin: 540, durationMin: 105 },
          ] }],
          parks: [],
          forecastPartial: false,
        },
      ]),
    )
  })
  await page.goto('/')
  await page.getByRole('combobox', { name: 'Where' }).fill('Lisbon')
  await page.getByRole('button', { name: 'Add flight times' }).click()
  await page.getByLabel('Landing, first day').fill('10:00')
  await page.getByTestId('search-submit').click()
  await page.getByTestId('option-card').nth(2).getByRole('button', { name: /View plan/ }).click()
  await expect(page.getByRole('heading', { name: 'Easy pace', level: 2 })).toBeVisible()

  await page.getByTestId('saved-open').click()
  await page.getByTestId('saved-item').filter({ hasText: 'Kyoto' }).getByRole('button').first().click()

  await expect(page.getByRole('heading', { name: 'Kyoto, Japan' })).toBeVisible()
  await expect(page.getByText('This page hit a problem')).toHaveCount(0)
  await expect(page.getByTestId('option-card')).toHaveCount(1)
  // The saved trip has no flights: the previous trip's times must not carry over.
  await expect(page.getByRole('button', { name: 'Add flight times' })).toBeVisible()
})

test('reloading a planned trip reopens the saved copy instead of saving a duplicate', async ({
  page,
  context,
}) => {
  const calls = await mockApis(context)
  await page.goto(`/?q=Lisbon&from=${inDays(3)}&to=${inDays(4)}&n=2&by=walk`)
  await expect(page.getByTestId('option-card').first()).toBeVisible()
  const geocodes = calls.geocode
  await page.reload()
  await expect(page.getByTestId('option-card').first()).toBeVisible()
  expect(calls.geocode).toBe(geocodes) // nothing was looked up again
  await page.getByTestId('saved-open').click()
  await expect(page.getByTestId('saved-item')).toHaveCount(1)
})

test('still plans the trip, and says what is missing, when only restaurants fail to load', async ({
  page,
  context,
}) => {
  await mockApis(context, { foodDown: true })
  await page.goto(`/?q=Lisbon&from=${inDays(3)}&to=${inDays(5)}&n=2&by=car`)
  await expect(page.getByTestId('option-card').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(/Restaurants and cafés could not be loaded/)).toBeVisible()
  await expect(page.getByTestId('error-card')).toHaveCount(0)
})

test('with Google configured: ratings, attribution, no open map, and nothing stored', async ({
  page,
  context,
}) => {
  const calls = await mockApis(context, { google: true })
  await page.goto(`/?q=Lisbon&from=${inDays(3)}&to=${inDays(5)}&n=2&by=transit`)
  await expect(page.getByTestId('option-card')).toHaveCount(3)
  await expect(page.getByTestId('google-attribution')).toContainText('Google Maps')
  expect(calls.overpass).toBe(0)

  await page.getByTestId('option-card').first().getByRole('button', { name: /View plan/ }).click()
  await expect(page.getByTestId('rating').first()).toContainText(/\d\.\d \([\d,]+ reviews\)/)
  await expect(page.getByRole('link', { name: 'Open in Google Maps' }).first()).toBeVisible()
  // Google's place data must not be drawn on a non-Google map.
  await expect(page.getByTestId('map')).toHaveCount(0)

  // Only the request is kept on the device; no place names are stored.
  const stored = await page.evaluate(() => localStorage.getItem('wayfarer.trips.v2') ?? '')
  expect(stored).toContain('"stub":true')
  expect(stored).not.toContain('Belém Tower')
  const cached = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open('wayfarer')
        open.onsuccess = () => {
          const db = open.result
          if (!db.objectStoreNames.contains('pools')) return resolve(0)
          const count = db.transaction('pools').objectStore('pools').count()
          count.onsuccess = () => resolve(count.result)
        }
        open.onerror = () => resolve(-1)
      }),
  )
  expect(cached).toBe(0)

  // Opening the saved entry plans it again from Google.
  await page.reload()
  await expect(page.getByTestId('option-card')).toHaveCount(3)
  expect(calls.google).toBe(2)
})

test('falls back to the free source when Google is configured but unavailable', async ({
  page,
  context,
}) => {
  const calls = await mockApis(context)
  await context.route('**/.netlify/functions/places', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"quota"}' }),
  )
  await page.goto(`/?q=Lisbon&from=${inDays(3)}&to=${inDays(4)}&n=2&by=walk`)
  await expect(page.getByTestId('option-card').first()).toBeVisible()
  await expect(page.getByTestId('google-attribution')).toHaveCount(0)
  expect(calls.overpass).toBe(4)
})

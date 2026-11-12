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
  expect(calls.overpass).toBe(1)

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
  expect(calls.overpass).toBe(3) // one attempt per mirror
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

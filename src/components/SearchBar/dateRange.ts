import { addDaysISO, daysBetweenInclusive, localISODate } from '../../types'
import { MAX_DAYS } from '../../share'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const parts = (isoDate: string) => {
  const [y, m, d] = isoDate.split('-').map(Number)
  return { y, m, d }
}

/**
 * The days of a month as a Monday-first grid of ISO dates, padded with
 * nulls to whole weeks. `month` is 1–12.
 */
export function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(Date.UTC(year, month - 1, 1))
  const lead = (first.getUTCDay() + 6) % 7 // Monday = 0
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const grid: (string | null)[] = Array.from({ length: lead }, () => null)
  for (let d = 1; d <= count; d++) grid.push(iso(year, month, d))
  while (grid.length % 7 !== 0) grid.push(null)
  return grid
}

/** Force a range to be valid: not in the past, in order, at most 14 days. */
export function clampRange(from: string, to: string, todayISO: string): { from: string; to: string } {
  const start = from < todayISO ? todayISO : from
  let end = to < start ? start : to
  if (daysBetweenInclusive(start, end) > MAX_DAYS) end = addDaysISO(start, MAX_DAYS - 1)
  return { from: start, to: end }
}

/** "12–16 Mar", "28 Mar – 2 Apr", or "12 Mar" for a single day. */
export function formatRange(from: string, to: string): string {
  const a = parts(from)
  const b = parts(to)
  if (from === to) return `${a.d} ${MONTHS[a.m - 1]}`
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${MONTHS[a.m - 1]}`
  return `${a.d} ${MONTHS[a.m - 1]} – ${b.d} ${MONTHS[b.m - 1]}`
}

/** "Fri 12 Mar" */
export function formatDay(isoDate: string): string {
  const { m, d } = parts(isoDate)
  const wd = new Date(`${isoDate}T00:00:00Z`).getUTCDay()
  return `${WEEKDAYS[wd]} ${d} ${MONTHS[m - 1]}`
}

/** Today's date in the traveller's own timezone. */
export const todayISO = (): string => localISODate()

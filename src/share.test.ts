import { describe, expect, it } from 'vitest'
import { paramsToRequest, requestToParams } from './share'
import type { TripRequest } from './types'

const today = '2027-03-01'
const req: TripRequest = {
  destinationQuery: 'Lisbon, Portugal',
  startDate: '2027-03-12',
  endDate: '2027-03-16',
  days: 5,
  travellers: 3,
  transport: 'car',
  flights: {},
}
const parse = (qs: string) => paramsToRequest(new URLSearchParams(qs), today)

describe('share links', () => {
  it('round-trips a request through the URL', () => {
    const { request, runnable } = paramsToRequest(requestToParams(req), today)
    expect(request).toEqual(req)
    expect(runnable).toBe(true)
    expect(requestToParams(req).toString()).toBe('q=Lisbon%2C+Portugal&from=2027-03-12&to=2027-03-16&n=3&by=car')
  })
  it('is not runnable with no destination', () => {
    expect(parse('from=2027-03-12&to=2027-03-14').runnable).toBe(false)
    expect(parse('').runnable).toBe(false)
  })
  it('repairs an end date before the start and does not auto-run', () => {
    const r = parse('q=Rome&from=2027-03-12&to=2027-03-10')
    expect(r.request).toMatchObject({ startDate: '2027-03-12', endDate: '2027-03-12', days: 1 })
    expect(r.runnable).toBe(false)
  })
  it('moves past dates to today and does not auto-run', () => {
    const r = parse('q=Rome&from=2026-01-01&to=2026-01-03')
    expect(r.request.startDate).toBe(today)
    expect(r.request.endDate).toBe('2027-03-03')
    expect(r.runnable).toBe(false)
  })
  it('clamps travellers and falls back on unknown transport', () => {
    expect(parse('q=Rome&from=2027-03-12&to=2027-03-13&n=0').request.travellers).toBe(2)
    expect(parse('q=Rome&from=2027-03-12&to=2027-03-13&n=99').request.travellers).toBe(12)
    expect(parse('q=Rome&from=2027-03-12&to=2027-03-13&n=abc').request.travellers).toBe(2)
    expect(parse('q=Rome&from=2027-03-12&to=2027-03-13&by=boat').request.transport).toBe('transit')
  })
  it('clamps a range longer than 14 days', () => {
    const r = parse('q=Rome&from=2027-03-12&to=2027-05-01')
    expect(r.request).toMatchObject({ endDate: '2027-03-25', days: 14 })
  })
  it('ignores garbage dates', () => {
    const r = parse('q=Rome&from=tomorrow&to=2027-13-45')
    expect(r.request.startDate).toBeUndefined()
    expect(r.runnable).toBe(false)
  })
})

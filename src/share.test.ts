import { describe, expect, it } from 'vitest'
import { chooseDestination, paramsToRequest, requestToParams } from './share'
import type { Destination } from './types'
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
  it('does not auto-run a link whose people or transport had to be repaired', () => {
    expect(parse('q=Rome&from=2027-03-12&to=2027-03-13&n=0').runnable).toBe(false)
    expect(parse('q=Rome&from=2027-03-12&to=2027-03-13&n=abc').runnable).toBe(false)
    expect(parse('q=Rome&from=2027-03-12&to=2027-03-13&by=boat').runnable).toBe(false)
    expect(parse('q=Rome&from=2027-03-12&to=2027-03-13').runnable).toBe(true)
  })
  it('carries the exact place so "Paris" can stay the one in Texas', () => {
    const texas = { ...req, destinationQuery: 'Paris', near: { lat: 33.6609, lon: -95.5556 } }
    const params = requestToParams(texas)
    expect(params.get('at')).toBe('33.661,-95.556')
    const back = paramsToRequest(params, today)
    expect(back.request.near).toEqual({ lat: 33.661, lon: -95.556 })
    expect(back.runnable).toBe(true)
  })
  it('ignores a malformed place hint', () => {
    expect(parse('q=Rome&from=2027-03-12&to=2027-03-13&at=north,south').request.near).toBeUndefined()
    expect(parse('q=Rome&from=2027-03-12&to=2027-03-13&at=999,5').request.near).toBeUndefined()
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

describe('chooseDestination', () => {
  const d = (name: string, lat: number, lon: number, country: string): Destination => ({
    name, lat, lon, country, countryCode: 'XX', timezone: 'UTC',
  })
  const paris = [d('Paris', 48.85, 2.35, 'France'), d('Paris', 33.66, -95.55, 'United States')]
  it('takes the first match when there is no hint', () => {
    expect(chooseDestination(paris)?.country).toBe('France')
  })
  it('takes the match nearest the hint', () => {
    expect(chooseDestination(paris, { lat: 33.661, lon: -95.556 })?.country).toBe('United States')
  })
  it('ignores a hint that is nowhere near any match', () => {
    expect(chooseDestination(paris, { lat: -33.9, lon: 151.2 })?.country).toBe('France')
  })
  it('returns nothing for no matches', () => {
    expect(chooseDestination([])).toBeUndefined()
  })
})

import { describe, expect, it } from 'vitest'
import { bookingUrl, citySearchUrl, rankStays, roomsFor } from './stays'
import { buildTrip } from './planner'
import { KM, dest, request, richPool, stay } from './testFixtures'

const base = { lat: 48.86, lon: 2.35 }
const at = (km: number) => ({ lat: 48.86 + km * KM, lon: 2.35 })
const params = (url: string) => Object.fromEntries(new URL(url).searchParams)

describe('roomsFor', () => {
  it('assumes two people per room', () => {
    expect([1, 2, 3, 5, 12].map(roomsFor)).toEqual([1, 1, 2, 3, 6])
  })
})

describe('bookingUrl', () => {
  it('prefills destination, dates, guests and rooms', () => {
    const req = request({ startDate: '2027-03-12', endDate: '2027-03-16', days: 5, travellers: 3 })
    const url = bookingUrl('Hotel Avenida, Lisbon', req)
    expect(url.startsWith('https://www.booking.com/searchresults.html?')).toBe(true)
    expect(params(url)).toMatchObject({
      ss: 'Hotel Avenida, Lisbon',
      checkin: '2027-03-12',
      checkout: '2027-03-16',
      group_adults: '3',
      no_rooms: '2',
      group_children: '0',
    })
  })
  it('checks out the next morning on a one-day trip', () => {
    const req = request({ startDate: '2027-03-12', endDate: '2027-03-12', days: 1 })
    expect(params(bookingUrl('X', req)).checkout).toBe('2027-03-13')
  })
})

describe('rankStays', () => {
  it('ranks a nearer stay above an equal farther one', () => {
    const near = stay({ ...at(0.3) })
    const far = stay({ ...at(4) })
    const ranked = rankStays([far, near], base, request(), 'Lisbon')
    expect(ranked.map((s) => s.id)).toEqual([near.id, far.id])
    expect(ranked[0].distanceFromBaseKm).toBeCloseTo(0.3, 1)
    expect(params(ranked[0].bookingUrl).ss).toBe(`${near.name}, Lisbon`)
  })
  it('returns at most four', () => {
    const many = Array.from({ length: 9 }, (_, i) => stay({ ...at(i * 0.2) }))
    expect(rankStays(many, base, request(), 'Lisbon')).toHaveLength(4)
  })
  it('mixes types: at most two of one type when others exist', () => {
    const hostels = Array.from({ length: 5 }, (_, i) => stay({ type: 'hostel', ...at(i * 0.1) }))
    const hotels = Array.from({ length: 3 }, (_, i) => stay({ type: 'hotel', ...at(2 + i * 0.1) }))
    const ranked = rankStays([...hostels, ...hotels], base, request(), 'Lisbon')
    expect(ranked.filter((s) => s.type === 'hostel')).toHaveLength(2)
    expect(ranked).toHaveLength(4)
  })
  it('fills with one type when that is all there is', () => {
    const hostels = Array.from({ length: 5 }, (_, i) => stay({ type: 'hostel', ...at(i * 0.1) }))
    expect(rankStays(hostels, base, request(), 'Lisbon')).toHaveLength(4)
  })
  it('lifts apartments for groups of four or more', () => {
    const hotel = stay({ type: 'hotel', ...at(0.5) })
    const flat = stay({ type: 'apartment', ...at(0.6) })
    expect(rankStays([hotel, flat], base, request({ travellers: 2 }), 'L')[0].id).toBe(hotel.id)
    expect(rankStays([hotel, flat], base, request({ travellers: 4 }), 'L')[0].id).toBe(flat.id)
  })
  it('lifts stays with parking for car trips', () => {
    const plain = stay({ ...at(0.5) })
    const parking = stay({ parking: true, ...at(0.9) })
    expect(rankStays([plain, parking], base, request({ transport: 'walk' }), 'L')[0].id).toBe(plain.id)
    expect(rankStays([plain, parking], base, request({ transport: 'car' }), 'L')[0].id).toBe(parking.id)
  })
  it('returns nothing for an empty list, and a city-wide search link still works', () => {
    expect(rankStays([], base, request(), 'Lisbon')).toEqual([])
    expect(params(citySearchUrl('Lisbon', request())).ss).toBe('Lisbon')
  })
})

describe('stays in a trip', () => {
  it('ranks each option’s stays around that option’s own base', () => {
    const pool = richPool()
    pool.stays = Array.from({ length: 12 }, (_, i) =>
      stay({ lat: 48.86 + (i % 4) * 0.01, lon: 2.35 + (i % 3) * 0.01 }),
    )
    const trip = buildTrip({ request: request(), destination: dest, pool, weatherByDate: new Map(), cityInfo: { timezone: 'UTC' } })
    for (const o of trip.options) {
      expect(o.stays.length).toBeGreaterThan(0)
      const d = o.stays.map((s) => s.distanceFromBaseKm)
      expect(d).toEqual([...d].sort((a, b) => a - b))
    }
  })
  it('adds a reserve-ahead note for groups of five or more', () => {
    const run = (travellers: number) =>
      buildTrip({ request: request({ travellers }), destination: dest, pool: richPool(), weatherByDate: new Map(), cityInfo: { timezone: 'UTC' } })
        .options[0].days[0].notes.join(' ')
    expect(run(5)).toContain('Reserve ahead for 5')
    expect(run(4)).not.toContain('Reserve ahead')
  })
})

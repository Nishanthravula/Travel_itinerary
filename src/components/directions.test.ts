import { describe, expect, it } from 'vitest'
import { directionsUrl } from './directions'

const a = { lat: 38.7098, lon: -9.1326 }
const b = { lat: 38.7139, lon: -9.1335 }

describe('directionsUrl', () => {
  it('opens Google Maps directions between two stops', () => {
    const u = new URL(directionsUrl(a, b, 'walk'))
    expect(u.origin + u.pathname).toBe('https://www.google.com/maps/dir/')
    expect(Object.fromEntries(u.searchParams)).toEqual({
      api: '1', origin: '38.7098,-9.1326', destination: '38.7139,-9.1335', travelmode: 'walking',
    })
  })
  it('uses the matching travel mode', () => {
    expect(new URL(directionsUrl(a, b, 'transit')).searchParams.get('travelmode')).toBe('transit')
    expect(new URL(directionsUrl(a, b, 'car')).searchParams.get('travelmode')).toBe('driving')
  })
  it('names the places by id when Google knows them', () => {
    const u = new URL(directionsUrl({ ...a, placeId: 'P1', name: 'Sé' }, { ...b, placeId: 'P2', name: 'Castle' }, 'walk'))
    expect(u.searchParams.get('origin_place_id')).toBe('P1')
    expect(u.searchParams.get('destination_place_id')).toBe('P2')
    expect(u.searchParams.get('origin')).toBe('Sé')
  })
})

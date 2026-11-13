import { describe, expect, it } from 'vitest'
import { formatDuration, formatKm } from './format'

describe('formatDuration', () => {
  it('writes minutes under an hour', () => expect(formatDuration(45)).toBe('45 min'))
  it('writes hours and minutes', () => expect(formatDuration(190)).toBe('3 h 10 min'))
  it('drops zero minutes', () => expect(formatDuration(120)).toBe('2 h'))
})
describe('formatKm', () => {
  it('uses metres under a kilometre', () => expect(formatKm(0.42)).toBe('400 m'))
  it('uses one decimal under ten kilometres', () => expect(formatKm(2.34)).toBe('2.3 km'))
  it('never claims zero distance', () => expect(formatKm(0.02)).toBe('under 100 m'))
})

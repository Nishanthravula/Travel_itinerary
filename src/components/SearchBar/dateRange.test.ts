import { describe, expect, it } from 'vitest'
import { clampRange, formatDay, formatRange, monthGrid } from './dateRange'

describe('monthGrid', () => {
  it('lays out March 2027, which starts on a Monday, with no leading gap', () => {
    const grid = monthGrid(2027, 3)
    expect(grid[0]).toBe('2027-03-01')
    expect(grid.filter(Boolean)).toHaveLength(31)
    expect(grid.length % 7).toBe(0)
  })
  it('pads a month that starts mid-week (April 2027 starts on a Thursday)', () => {
    const grid = monthGrid(2027, 4)
    expect(grid.slice(0, 4)).toEqual([null, null, null, '2027-04-01'])
    expect(grid.filter(Boolean)).toHaveLength(30)
  })
  it('handles February in a leap year', () => {
    expect(monthGrid(2028, 2).filter(Boolean)).toHaveLength(29)
  })
})

describe('clampRange', () => {
  const today = '2027-02-20'
  it('limits a trip to 14 days', () => {
    expect(clampRange('2027-03-01', '2027-03-30', today)).toEqual({ from: '2027-03-01', to: '2027-03-14' })
  })
  it('moves a past start to today', () => {
    expect(clampRange('2027-01-01', '2027-02-22', today)).toEqual({ from: today, to: '2027-02-22' })
  })
  it('never ends before it starts', () => {
    expect(clampRange('2027-03-05', '2027-03-01', today)).toEqual({ from: '2027-03-05', to: '2027-03-05' })
  })
})

describe('formatting', () => {
  it('writes a range within one month compactly', () => {
    expect(formatRange('2027-03-12', '2027-03-16')).toBe('12–16 Mar')
  })
  it('names both months when the range crosses one', () => {
    expect(formatRange('2027-03-28', '2027-04-02')).toBe('28 Mar – 2 Apr')
  })
  it('writes a single day once', () => {
    expect(formatRange('2027-03-12', '2027-03-12')).toBe('12 Mar')
  })
  it('writes a day with its weekday', () => {
    expect(formatDay('2027-03-12')).toBe('Fri 12 Mar')
  })
})

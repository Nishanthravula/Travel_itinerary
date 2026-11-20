import { describe, expect, it } from 'vitest'
import { emptyDayText } from './emptyDay'

describe('emptyDayText', () => {
  it('talks about the flight when a flight shaped the day', () => {
    expect(emptyDayText(true)).toMatch(/flight/)
  })
  it('does not mention a flight when there was none', () => {
    expect(emptyDayText(false)).not.toMatch(/flight/i)
  })
})

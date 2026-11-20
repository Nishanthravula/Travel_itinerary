import { describe, expect, it } from 'vitest'
import { nextMode } from './transportMode'

describe('nextMode', () => {
  it('moves down and right through the options', () => {
    expect(nextMode('walk', 'ArrowDown')).toBe('transit')
    expect(nextMode('transit', 'ArrowRight')).toBe('car')
  })
  it('moves up and left', () => {
    expect(nextMode('car', 'ArrowUp')).toBe('transit')
    expect(nextMode('transit', 'ArrowLeft')).toBe('walk')
  })
  it('wraps around at both ends, like a native radio group', () => {
    expect(nextMode('car', 'ArrowDown')).toBe('walk')
    expect(nextMode('walk', 'ArrowUp')).toBe('car')
  })
  it('jumps to the first and last with Home and End', () => {
    expect(nextMode('transit', 'Home')).toBe('walk')
    expect(nextMode('walk', 'End')).toBe('car')
  })
  it('ignores other keys', () => {
    expect(nextMode('walk', 'Enter')).toBeNull()
  })
})

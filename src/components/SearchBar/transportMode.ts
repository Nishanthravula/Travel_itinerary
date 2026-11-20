import type { TransportMode } from '../../types'

export const MODE_ORDER: TransportMode[] = ['walk', 'transit', 'car']

/**
 * Where the arrow keys move in the transport radio group: like a native
 * radio group, they wrap at both ends, and Home/End jump to the ends.
 */
export function nextMode(current: TransportMode, key: string): TransportMode | null {
  const i = MODE_ORDER.indexOf(current)
  const n = MODE_ORDER.length
  switch (key) {
    case 'ArrowDown':
    case 'ArrowRight':
      return MODE_ORDER[(i + 1) % n]
    case 'ArrowUp':
    case 'ArrowLeft':
      return MODE_ORDER[(i - 1 + n) % n]
    case 'Home':
      return MODE_ORDER[0]
    case 'End':
      return MODE_ORDER[n - 1]
    default:
      return null
  }
}

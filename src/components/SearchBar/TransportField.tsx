import { useRef, type ComponentType } from 'react'
import { nextMode } from './transportMode'
import type { TransportMode } from '../../types'
import { CarIcon, TransitIcon, WalkIcon } from '../../ui/icons'

interface Props {
  value: TransportMode
  /** Selection moved with the arrow keys. */
  onChange: (mode: TransportMode) => void
  /** A mode was clicked or confirmed with Enter or Space. */
  onPick: (mode: TransportMode) => void
}

export const MODES: Array<{
  id: TransportMode
  label: string
  hint: string
  Icon: ComponentType<{ size?: number }>
}> = [
  { id: 'walk', label: 'Walking', hint: 'Compact days within about 5 km', Icon: WalkIcon },
  { id: 'transit', label: 'Transit', hint: 'The whole city by metro, tram or bus', Icon: TransitIcon },
  { id: 'car', label: 'Car', hint: 'Wider reach, with nearby nature', Icon: CarIcon },
]

export default function TransportField({ value, onChange, onPick }: Props) {
  const list = useRef<HTMLDivElement>(null)

  // Roving focus, as in a native radio group: one tab stop, arrows move it.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const next = nextMode(value, e.key)
    if (!next) return
    e.preventDefault()
    onChange(next)
    requestAnimationFrame(() =>
      list.current?.querySelector<HTMLElement>(`[data-mode="${next}"]`)?.focus(),
    )
  }

  return (
    <div
      ref={list}
      className="mode-list"
      role="radiogroup"
      aria-label="How you will get around"
      onKeyDown={onKeyDown}
    >
      {MODES.map(({ id, label, hint, Icon }) => (
        <button
          key={id}
          type="button"
          role="radio"
          data-mode={id}
          tabIndex={value === id ? 0 : -1}
          aria-checked={value === id}
          data-autofocus={value === id ? '' : undefined}
          className={value === id ? 'mode is-selected' : 'mode'}
          onClick={() => onPick(id)}
        >
          <Icon size={20} />
          <span>
            <span className="mode-label">{label}</span>
            <span className="mode-hint">{hint}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

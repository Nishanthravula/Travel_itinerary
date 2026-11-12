import type { ComponentType } from 'react'
import type { TransportMode } from '../../types'
import { CarIcon, TransitIcon, WalkIcon } from '../../ui/icons'

interface Props {
  value: TransportMode
  onChange: (mode: TransportMode) => void
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

export default function TransportField({ value, onChange }: Props) {
  return (
    <div className="mode-list" role="radiogroup" aria-label="How you will get around">
      {MODES.map(({ id, label, hint, Icon }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          data-autofocus={value === id ? '' : undefined}
          className={value === id ? 'mode is-selected' : 'mode'}
          onClick={() => onChange(id)}
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

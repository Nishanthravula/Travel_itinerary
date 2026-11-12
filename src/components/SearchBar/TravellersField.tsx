import { MAX_TRAVELLERS } from '../../share'
import { MinusIcon, PlusIcon } from '../../ui/icons'
import { roomsFor } from '../../planner/stays'

interface Props {
  value: number
  onChange: (n: number) => void
}

export const peopleLabel = (n: number) => (n === 1 ? '1 person' : `${n} people`)

export default function TravellersField({ value, onChange }: Props) {
  const rooms = roomsFor(value)
  return (
    <div className="stepper-panel">
      <div className="stepper">
        <button
          type="button"
          className="icon-button round"
          aria-label="Fewer people"
          disabled={value <= 1}
          onClick={() => onChange(value - 1)}
        >
          <MinusIcon />
        </button>
        <output className="stepper-value" aria-live="polite">
          {peopleLabel(value)}
        </output>
        <button
          type="button"
          className="icon-button round"
          aria-label="More people"
          data-autofocus
          disabled={value >= MAX_TRAVELLERS}
          onClick={() => onChange(value + 1)}
        >
          <PlusIcon />
        </button>
      </div>
      <p className="hint">
        Stays are searched for {rooms} room{rooms === 1 ? '' : 's'}.
      </p>
    </div>
  )
}

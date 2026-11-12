import { useEffect, useId, useRef, useState } from 'react'
import type { Destination } from '../../types'
import { searchDestinations } from '../../api/geocode'

interface Props {
  value: string
  disabled: boolean
  onChange: (text: string) => void
  /** A suggestion was chosen — the exact place is known. */
  onPick: (dest: Destination) => void
}

export const placeLine = (d: Destination) =>
  [d.admin1 && d.admin1 !== d.name ? d.admin1 : null, d.country].filter(Boolean).join(', ')

/**
 * Destination input with suggestions. Free text still works — suggestions
 * exist so "Paris" can mean the one in Texas when that's what you want.
 */
export default function DestinationField({ value, disabled, onChange, onPick }: Props) {
  const [options, setOptions] = useState<Destination[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const listId = useId()
  const skipNext = useRef(false)

  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false
      return
    }
    const q = value.trim()
    if (q.length < 2) {
      setOptions([])
      return
    }
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      searchDestinations(q, ctrl.signal)
        .then((found) => {
          setOptions(found)
          setActive(-1)
          setOpen(document.activeElement?.id === `${listId}-input` && found.length > 0)
        })
        .catch(() => {
          /* offline or cancelled: typing still works without suggestions */
        })
    }, 250)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [value, listId])

  const pick = (d: Destination) => {
    skipNext.current = true
    onChange(d.name)
    onPick(d)
    setOpen(false)
    setOptions([])
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || options.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % options.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i <= 0 ? options.length - 1 : i - 1))
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault()
      pick(options[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="segment segment-where">
      <label className="segment-label" htmlFor={`${listId}-input`}>
        Where
      </label>
      <input
        id={`${listId}-input`}
        className="segment-input"
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        placeholder="City or town"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(options.length > 0)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul id={listId} role="listbox" className="popover popover-start suggestions">
          {options.map((d, i) => (
            <li
              key={`${d.lat},${d.lon}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'suggestion is-active' : 'suggestion'}
              onPointerDown={(e) => {
                e.preventDefault()
                pick(d)
              }}
              onPointerEnter={() => setActive(i)}
            >
              <span className="suggestion-name">{d.name}</span>
              <span className="suggestion-place">{placeLine(d)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

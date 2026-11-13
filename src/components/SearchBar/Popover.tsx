import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  label: string
  onClose: () => void
  children: ReactNode
  align?: 'start' | 'end'
  className?: string
}

const FOCUSABLE =
  'button:not([disabled]):not([tabindex="-1"]), [href], input:not([disabled]), [tabindex="0"]'

/**
 * A small dialog anchored under a search-bar segment. Focus moves in on
 * open, is kept inside while open, and returns to the opener on close.
 * Esc or a click outside closes it.
 */
export default function Popover({ label, onClose, children, align = 'start', className }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const node = ref.current!
    const first =
      node.querySelector<HTMLElement>('[data-autofocus]') ?? node.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()

    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node
      // The opener toggles the popover itself; don't close-then-reopen.
      if (!node.contains(target) && !opener?.contains(target)) onClose()
    }
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      if (node.contains(document.activeElement) || document.activeElement === document.body) {
        opener?.focus()
      }
    }
    // Mount/unmount only: onClose identity must not re-run the focus logic.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key !== 'Tab') return
    const items = [...ref.current!.querySelectorAll<HTMLElement>(FOCUSABLE)]
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      className={`popover popover-${align}${className ? ` ${className}` : ''}`}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  )
}

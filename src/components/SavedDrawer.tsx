import { useEffect, useRef } from 'react'
import type { Trip } from '../types'
import { placeTitle, requestLine } from '../format'
import { CloseIcon, TrashIcon } from '../ui/icons'

interface Props {
  trips: Trip[]
  onOpen: (trip: Trip) => void
  onDelete: (id: string) => void
  onClose: () => void
}

/** Saved trips: every plan is kept on this device and opens offline. */
export default function SavedDrawer({ trips, onOpen, onDelete, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current!
    if (!dialog.open) dialog.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      className="drawer"
      aria-label="Saved trips"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close() // backdrop
      }}
    >
      <div className="drawer-inner">
        <header className="drawer-head">
          <h2>Saved trips</h2>
          <button className="icon-button" aria-label="Close" onClick={() => ref.current?.close()}>
            <CloseIcon />
          </button>
        </header>
        {trips.length === 0 ? (
          <p className="empty">
            Nothing saved yet. Every trip you plan is kept here on this device, and opens without a
            connection.
          </p>
        ) : (
          <ul className="saved-list">
            {trips.map((t) => (
              <li key={t.id} className="saved" data-testid="saved-item">
                <button
                  className="saved-open"
                  onClick={() => {
                    onOpen(t)
                    ref.current?.close()
                  }}
                >
                  <span className="saved-name">{placeTitle(t.destination)}</span>
                  <span className="saved-meta">{requestLine(t.request)}</span>
                </button>
                <button
                  className="icon-button"
                  aria-label={`Delete trip to ${t.destination.name}`}
                  onClick={() => onDelete(t.id)}
                >
                  <TrashIcon />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </dialog>
  )
}

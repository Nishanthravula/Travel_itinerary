import type { ComponentType } from 'react'
import type { Place, PlaceKind } from '../types'
import {
  CoffeeIcon, MarketIcon, MealIcon, MuseumIcon, SightIcon, TreeIcon, ViewIcon,
} from '../ui/icons'

const ICON: Record<PlaceKind, ComponentType<{ size?: number }>> = {
  attraction: SightIcon,
  museum: MuseumIcon,
  viewpoint: ViewIcon,
  park: TreeIcon,
  national_park: TreeIcon,
  restaurant: MealIcon,
  cafe: CoffeeIcon,
  market: MarketIcon,
}

/** Tint family for a place without a photo. */
export const tintOf = (kind: PlaceKind) =>
  kind === 'restaurant' || kind === 'cafe' || kind === 'market'
    ? 'food'
    : kind === 'park' || kind === 'national_park'
      ? 'nature'
      : 'sight'

interface Props {
  place: Place
  size?: 'sm' | 'lg'
}

/**
 * A place's picture: its Wikipedia photo when one clearly matches, else a
 * tinted tile with the icon for its kind. The photo links to its source.
 */
export default function Thumb({ place, size = 'sm' }: Props) {
  if (place.photo) {
    return (
      <a
        className={`thumb thumb-${size}`}
        href={place.photo.pageUrl}
        target="_blank"
        rel="noreferrer"
        title="Photo from Wikipedia"
      >
        <img
          src={place.photo.url}
          alt={place.name}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
        />
      </a>
    )
  }
  const Icon = ICON[place.kind] ?? SightIcon
  return (
    <span className={`thumb thumb-${size} thumb-${tintOf(place.kind)}`} aria-hidden>
      <Icon size={size === 'lg' ? 28 : 20} />
    </span>
  )
}

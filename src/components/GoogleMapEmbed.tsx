import type { PlanOption, TransportMode } from '../types'
import { embedUrl } from './googleEmbed'

interface Props {
  option: PlanOption
  activeDay: number | 'stay'
  transport: TransportMode
  embedKey: string
}

/** The active day on Google's embeddable map. */
export default function GoogleMapEmbed({ option, activeDay, transport, embedKey }: Props) {
  return (
    <iframe
      className="map map-google"
      data-testid="google-map"
      title={activeDay === 'stay' ? 'Places to stay on Google Maps' : 'The day’s route on Google Maps'}
      src={embedUrl(option, activeDay, transport, embedKey)}
      loading="lazy"
      allowFullScreen
      referrerPolicy="no-referrer-when-downgrade"
    />
  )
}

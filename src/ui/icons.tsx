import type { ReactNode, SVGProps } from 'react'

/** Line icons drawn on a 24px grid, coloured by the surrounding text. */
type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number }

function make(paths: ReactNode) {
  return function Icon({ size = 18, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        {...rest}
      >
        {paths}
      </svg>
    )
  }
}

export const SearchIcon = make(<><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>)
export const ArrowRightIcon = make(<path d="M5 12h14m-5-5 5 5-5 5" />)
export const ArrowLeftIcon = make(<path d="M19 12H5m5-5-5 5 5 5" />)
export const ChevronLeftIcon = make(<path d="m15 6-6 6 6 6" />)
export const ChevronRightIcon = make(<path d="m9 6 6 6-6 6" />)
export const CloseIcon = make(<path d="M6 6l12 12M18 6 6 18" />)
export const PlusIcon = make(<path d="M12 5v14M5 12h14" />)
export const MinusIcon = make(<path d="M5 12h14" />)
export const LinkIcon = make(<><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>)
export const BookmarkIcon = make(<path d="M7 4h10v16l-5-3.5L7 20z" />)
export const TrashIcon = make(<path d="M5 7h14M10 7V4h4v3m-7 0 1 13h8l1-13" />)
export const ExternalIcon = make(<path d="M14 5h5v5m0-5-8 8M10 6H6v12h12v-4" />)
export const MapIcon = make(<path d="m9 5-5 2v12l5-2 6 2 5-2V5l-5 2-6-2zm0 0v12m6-10v12" />)

export const WalkIcon = make(<><circle cx="13" cy="4.5" r="1.6" /><path d="m9 21 2.5-6.5L9.5 12l1-4.5 3 1.5 1.5 3 3 1M11 8 7.5 9.5 7 13m5.5 3 2 5" /></>)
export const TransitIcon = make(<><rect x="6" y="3.5" width="12" height="13" rx="2.5" /><path d="M6 11h12M9.5 14h.01M14.5 14h.01M8.5 16.5 7 20m8.5-3.5L17 20" /></>)
export const CarIcon = make(<><path d="M4 16v-3l1.8-5a2 2 0 0 1 1.9-1.4h8.6A2 2 0 0 1 18.2 8L20 13v3" /><path d="M4 13h16M4 16h16v2.5M4 16v2.5M7.5 13v.01M16.5 13v.01" /></>)

export const SightIcon = make(<path d="M4 20h16M6 20V10m4 10V10m4 10V10m4 10V10M4 10l8-6 8 6z" />)
export const MuseumIcon = make(<><rect x="4" y="5" width="16" height="14" rx="1.5" /><path d="m4 15 4.5-4 4 3.5 3-2.5L20 16M15.5 9h.01" /></>)
export const ViewIcon = make(<path d="M3 19 9 8l4 6 2.5-3.5L21 19zM17 5.5h.01" />)
export const TreeIcon = make(<path d="M12 21v-6m0 0-5 .5a3.5 3.5 0 0 1-.5-6.5 5.5 5.5 0 0 1 11 0 3.5 3.5 0 0 1-.5 6.5z" />)
export const MealIcon = make(<path d="M7 3v7a2 2 0 0 0 4 0V3M9 12v9m7-18c-1.7 1.5-2.5 3.6-2.5 6.5V13H16zm0 10v8" />)
export const CoffeeIcon = make(<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zm11 1.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3v2.5M12 3v2.5" />)
export const MarketIcon = make(<path d="M4 9 5.5 4h13L20 9M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9M5.5 12v8h13v-8M10 20v-4.5h4V20" />)
export const BedIcon = make(<path d="M3 18V6m0 9h18v3M3 12h11a4 4 0 0 1 4 4M7.5 9.5h.01M21 15v-1" />)
export const UsersIcon = make(<><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0m1.5-14.6a3.2 3.2 0 0 1 0 5.6M18 14.5a5.5 5.5 0 0 1 3 5.5" /></>)
export const CalendarIcon = make(<><rect x="4" y="5.5" width="16" height="14.5" rx="2" /><path d="M4 10h16M8.5 3.5v4m7-4v4" /></>)
export const PinIcon = make(<><path d="M12 21s6.5-5.6 6.5-11a6.5 6.5 0 0 0-13 0C5.500 15.400 12 21 12 21z" /><circle cx="12" cy="10" r="2.3" /></>)

export const SunIcon = make(<><circle cx="12" cy="12" r="3.8" /><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></>)
export const CloudIcon = make(<path d="M7.5 18.5a4 4 0 0 1-.6-8 5.5 5.5 0 0 1 10.600-1 4.500 4.500 0 0 1-.5 9z" />)
export const RainIcon = make(<path d="M7.5 15a4 4 0 0 1-.6-8 5.500 5.500 0 0 1 10.600-1 4.500 4.500 0 0 1-.5 9M9 18l-1 2.500M13 18l-1 2.500M17 18l-1 2.500" />)
export const SnowIcon = make(<path d="M12 3v18M4.2 7.500l15.600 9M19.800 7.500l-15.600 9" />)
export const StarIcon = make(<path d="m12 4 2.400 5 5.400.700-4 3.800 1 5.400-4.800-2.700-4.800 2.700 1-5.400-4-3.800 5.400-.700z" />)

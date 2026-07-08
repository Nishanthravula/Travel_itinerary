import type { Itinerary } from '../types'

/**
 * "Know before you go": what makes the city unique (Wikipedia) plus
 * practical local information — timezone, currency, languages, driving side.
 */
export default function CityOverview({ itinerary }: { itinerary: Itinerary }) {
  const { cityInfo, destination } = itinerary

  const facts: Array<[string, string | undefined]> = [
    ['Timezone', cityInfo.timezone],
    ['Currency', cityInfo.currency],
    ['Languages', cityInfo.languages],
    ['Driving side', cityInfo.drivingSide],
    [
      'Population',
      destination.population ? destination.population.toLocaleString() : undefined,
    ],
  ]

  return (
    <section className="card overview">
      <h2>
        About {destination.name}
        {destination.country && <span className="muted"> · {destination.country}</span>}
      </h2>
      {cityInfo.summary && <p className="overview-text">{cityInfo.summary}</p>}
      {cityInfo.wikipediaUrl && (
        <p>
          <a href={cityInfo.wikipediaUrl} target="_blank" rel="noreferrer">
            Read more on Wikipedia →
          </a>
        </p>
      )}
      <dl className="facts">
        {facts
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="fact">
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
    </section>
  )
}

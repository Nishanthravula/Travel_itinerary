import type { Trip } from '../types'

/**
 * What makes the city itself (Wikipedia) plus the practical facts —
 * timezone, currency, languages, driving side.
 */
export default function CityOverview({ trip }: { trip: Trip }) {
  const { cityInfo, destination } = trip
  const facts: Array<[string, string | undefined]> = [
    ['Timezone', cityInfo.timezone],
    ['Currency', cityInfo.currency],
    ['Languages', cityInfo.languages],
    ['Drives on the', cityInfo.drivingSide],
    ['Population', destination.population ? destination.population.toLocaleString() : undefined],
  ]
  const shown = facts.filter(([, v]) => v)
  if (!cityInfo.summary && shown.length <= 1) return null

  return (
    <section className="about">
      <h3>About {destination.name}</h3>
      {cityInfo.summary && <p className="about-text">{cityInfo.summary}</p>}
      {cityInfo.wikipediaUrl && (
        <p>
          <a href={cityInfo.wikipediaUrl} target="_blank" rel="noreferrer">
            Read more on Wikipedia
          </a>
        </p>
      )}
      <dl className="facts">
        {shown.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {trip.parks.length > 0 && (
        <>
          <h3>Parks and nature within reach</h3>
          <ul className="parks">
            {trip.parks.map((park) => (
              <li key={park.id}>
                {park.website ? (
                  <a href={park.website} target="_blank" rel="noreferrer">
                    {park.name}
                  </a>
                ) : (
                  park.name
                )}
                <span className="muted">
                  {' '}
                  about {park.distanceKm < 1 ? 'under 1' : Math.round(park.distanceKm)} km away
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

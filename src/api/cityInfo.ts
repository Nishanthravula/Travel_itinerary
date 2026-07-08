import type { CityInfo, Destination } from '../types'

interface WikiSummary {
  extract?: string
  content_urls?: { desktop?: { page?: string } }
}

interface RestCountry {
  currencies?: Record<string, { name?: string; symbol?: string }>
  languages?: Record<string, string>
  car?: { side?: string }
}

/**
 * City overview ("what makes it unique") from Wikipedia plus practical
 * country facts (currency, languages, driving side) from REST Countries.
 * Both are best-effort — the itinerary still works if either fails.
 */
export async function fetchCityInfo(dest: Destination): Promise<CityInfo> {
  const info: CityInfo = { timezone: dest.timezone }

  const [wiki, country] = await Promise.allSettled([
    fetchWikiSummary(dest),
    fetchCountryFacts(dest.countryCode),
  ])

  if (wiki.status === 'fulfilled' && wiki.value) {
    info.summary = wiki.value.extract
    info.wikipediaUrl = wiki.value.content_urls?.desktop?.page
  }
  if (country.status === 'fulfilled' && country.value) {
    const c = country.value
    info.currency = Object.values(c.currencies ?? {})
      .map((cur) => (cur.symbol ? `${cur.name} (${cur.symbol})` : cur.name))
      .filter(Boolean)
      .join(', ')
    info.languages = Object.values(c.languages ?? {}).join(', ')
    info.drivingSide = c.car?.side
  }
  return info
}

async function fetchWikiSummary(dest: Destination): Promise<WikiSummary | null> {
  // Try "City" first; disambiguate with country if that page is missing.
  for (const title of [dest.name, `${dest.name}, ${dest.country}`]) {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      { headers: { Accept: 'application/json' } },
    )
    if (res.ok) {
      const data = (await res.json()) as WikiSummary & { type?: string }
      if (data.extract && data.type !== 'disambiguation') return data
    }
  }
  return null
}

async function fetchCountryFacts(code: string): Promise<RestCountry | null> {
  if (!code) return null
  const res = await fetch(
    `https://restcountries.com/v3.1/alpha/${code}?fields=currencies,languages,car`,
  )
  if (!res.ok) return null
  const data = (await res.json()) as RestCountry | RestCountry[]
  return Array.isArray(data) ? (data[0] ?? null) : data
}

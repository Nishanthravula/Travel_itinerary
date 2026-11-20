import type { CityInfo, Destination } from '../types'
import { fetchJson } from './http'
import { heroImageUrl } from './photos'

interface WikiSummary {
  extract?: string
  content_urls?: { desktop?: { page?: string } }
  thumbnail?: { source?: string; width?: number; height?: number }
  originalimage?: { source?: string; width?: number; height?: number }
}

/** ISO country code → [currencies, languages], bundled from the
 * world-countries dataset (ODbL). REST Countries now needs an API key. */
type CountryFacts = Record<string, [string, string]>

let facts: Promise<CountryFacts> | null = null
const loadFacts = () =>
  (facts ??= import('./countryFacts.json').then((m) => m.default as unknown as CountryFacts))

/**
 * City overview ("what makes it unique") from Wikipedia plus practical
 * country facts (currency, languages) from bundled data. The Wikipedia part
 * is best-effort — the itinerary still works without it.
 */
export async function fetchCityInfo(dest: Destination, signal?: AbortSignal): Promise<CityInfo> {
  const info: CityInfo = { timezone: dest.timezone }

  const [wiki, country] = await Promise.allSettled([
    fetchWikiSummary(dest, signal),
    loadFacts().then((all) => all[dest.countryCode.toUpperCase()] ?? null),
  ])

  if (wiki.status === 'fulfilled' && wiki.value) {
    info.summary = wiki.value.extract
    info.wikipediaUrl = wiki.value.content_urls?.desktop?.page
    const image = heroImageUrl(wiki.value)
    if (image && info.wikipediaUrl) info.image = { url: image, pageUrl: info.wikipediaUrl }
  }
  if (country.status === 'fulfilled' && country.value) {
    const [currency, languages] = country.value
    if (currency) info.currency = currency
    if (languages) info.languages = languages
  }
  return info
}

async function fetchWikiSummary(
  dest: Destination,
  signal?: AbortSignal,
): Promise<WikiSummary | null> {
  // Try "City" first; disambiguate with country if that page is missing.
  for (const title of [dest.name, `${dest.name}, ${dest.country}`]) {
    try {
      const data = await fetchJson<WikiSummary & { type?: string }>(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
        { init: { headers: { Accept: 'application/json' } }, timeoutMs: 8000, retries: 0, signal },
      )
      if (data.extract && data.type !== 'disambiguation') return data
    } catch {
      // missing page or network trouble — try the next title, then give up
    }
  }
  return null
}

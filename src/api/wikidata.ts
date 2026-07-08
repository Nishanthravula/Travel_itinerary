/**
 * Fame lookup via Wikidata sitelink counts.
 *
 * A place's sitelink count — how many Wikipedia language editions have an
 * article about it — is a strong, free, keyless proxy for how famous it
 * is worldwide (Eiffel Tower ≈ 280, a neighbourhood chapel ≈ 2). OSM
 * elements carry Wikidata QIDs, so the join is exact.
 */
const ENDPOINT = 'https://query.wikidata.org/sparql'

interface SparqlResponse {
  results?: {
    bindings?: Array<{
      item?: { value?: string }
      links?: { value?: string }
    }>
  }
}

/**
 * Batch-fetch sitelink counts for up to 400 QIDs in a single SPARQL query.
 * Best-effort: any failure returns an empty map and the caller falls back
 * to tag-based scores.
 */
export async function fetchSitelinkCounts(
  qids: (string | undefined)[],
): Promise<Map<string, number>> {
  const unique = [...new Set(qids)]
    .filter((q): q is string => !!q && /^Q\d+$/.test(q))
    .slice(0, 400)
  if (unique.length === 0) return new Map()

  const values = unique.map((q) => `wd:${q}`).join(' ')
  const query = `SELECT ?item (COUNT(?link) AS ?links) WHERE { VALUES ?item { ${values} } ?link schema:about ?item . } GROUP BY ?item`

  try {
    const res = await fetch(`${ENDPOINT}?format=json&query=${encodeURIComponent(query)}`, {
      headers: { Accept: 'application/sparql-results+json' },
    })
    if (!res.ok) return new Map()
    const data = (await res.json()) as SparqlResponse

    const counts = new Map<string, number>()
    for (const b of data.results?.bindings ?? []) {
      const qid = b.item?.value?.split('/').pop()
      const n = Number(b.links?.value ?? 0)
      if (qid && Number.isFinite(n)) counts.set(qid, n)
    }
    return counts
  } catch {
    return new Map()
  }
}

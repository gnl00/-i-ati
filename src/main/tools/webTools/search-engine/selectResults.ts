import type { SearchResultItem } from './types'

function canonicalKey(url: URL): string {
  const normalized = new URL(url)
  normalized.hash = ''
  normalized.hostname = normalized.hostname.replace(/^www\./, '')
  for (const key of [...normalized.searchParams.keys()]) {
    if (/^(utm_.*|gclid|fbclid|msclkid)$/i.test(key)) normalized.searchParams.delete(key)
  }
  normalized.searchParams.sort()
  // Apple support regional mirrors share an article ID; keep different languages/versions.
  if (normalized.hostname === 'support.apple.com') {
    normalized.pathname = normalized.pathname.replace(
      /^\/([a-z]{2})-[a-z]{2}\/(?=guide\/|\d+(?:\/|$))/i, '/$1/'
    )
  }
  return normalized.host + normalized.pathname.replace(/\/$/, '') + normalized.search
}

/** Prefer query-matching first-party domains, then retain the engine's stable order. */
export function selectSearchResults(
  items: SearchResultItem[], query: string, count: number
): SearchResultItem[] {
  const words = new Set((query.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || [])
    .filter(word => !/^(?:time|machine|backup|disk|size|guide|official|documentation|support|search|news|how|what|best|download|latest|current)$/.test(word)))
  const wantsPrerelease = /\b(?:alpha|beta|nightly|prerelease|dev|\d+\.\d+)\b/i.test(query)
  const ranked = items.flatMap((item, index) => {
    try {
      const url = new URL(item.link)
      if (!['http:', 'https:'].includes(url.protocol)) return []
      const labels = url.hostname.replace(/^www\./, '').split('.')
      const brand = labels.at(-2) || ''
      const community = /^(?:forums?|discussions?|community)\./i.test(url.hostname)
      const firstParty = words.has(brand) && !community
      const prerelease = !wantsPrerelease && /\b(?:\d+\.\d+(?:\.\d+)?(?:a|b|rc)\d+|alpha|beta|nightly|prerelease)\b/i.test(item.title)
      return [{ item, index, key: canonicalKey(url), score: (firstParty ? 2 : 0) - (prerelease ? 3 : 0) }]
    } catch {
      return []
    }
  }).sort((a, b) => b.score - a.score || a.index - b.index)
  const seen = new Set<string>()
  return ranked.filter(result => {
    if (seen.has(result.key)) return false
    seen.add(result.key)
    return true
  }).slice(0, count).map(result => result.item)
}

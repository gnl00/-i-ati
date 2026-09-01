import type { SearchEngineDefinition } from './types'

export const duckDuckGoSearchEngine: SearchEngineDefinition = {
  id: 'duckduckgo',
  displayName: 'DuckDuckGo',
  buildSearchUrl: (query: string) =>
    `https://duckduckgo.com/?q=${encodeURIComponent(query)}&ia=web`,
  waitForResultsScript: `document.querySelectorAll('article[data-testid="result"] a[data-testid="result-title-a"], [data-testid="result"] a[data-testid="result-title-a"]').length > 0`,
  buildExtractResultsScript: (count: number) => `
    (() => {
      const results = []
      const seen = new Set()
      const items = document.querySelectorAll('article[data-testid="result"], [data-testid="result"]')

      const normalizeUrl = (href) => {
        try {
          const parsed = new URL(href, window.location.href)
          if (!['http:', 'https:'].includes(parsed.protocol)) return ''

          if (parsed.hostname === 'duckduckgo.com' || parsed.hostname.endsWith('.duckduckgo.com')) {
            if (parsed.pathname === '/l/') {
              return parsed.searchParams.get('uddg') || ''
            }
            return ''
          }

          return parsed.toString()
        } catch {
          return ''
        }
      }

      for (const item of items) {
        if (results.length >= ${count}) break

        const linkElement = item.querySelector('a[data-testid="result-title-a"], h2 a[href]')
        const link = normalizeUrl(linkElement?.href || '')
        if (!link || seen.has(link)) continue

        const title = linkElement?.textContent?.replace(/\\s+/g, ' ').trim() || ''
        if (!title) continue

        const snippetElement = item.querySelector(
          '[data-result="snippet"], [data-testid="result-snippet"], .result__snippet'
        )
        const snippet = snippetElement?.textContent?.replace(/\\s+/g, ' ').trim() || ''

        seen.add(link)
        results.push({ link, title, snippet })
      }

      return results
    })()
  `
}

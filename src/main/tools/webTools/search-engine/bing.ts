import type { SearchEngineDefinition } from './types'

export const bingSearchEngine: SearchEngineDefinition = {
  id: 'bing',
  displayName: 'Bing',
  buildSearchUrl: (query: string) => `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
  waitForResultsScript: `document.querySelectorAll('ol#b_results').length > 0`,
  buildExtractResultsScript: (count: number) => `
    (() => {
      const results = []
      const searchResultItems = document.querySelectorAll('ol#b_results li.b_algo')

      const decodeBingRedirect = (href) => {
        try {
          const parsed = new URL(href)
          const isBingRedirect = parsed.hostname.includes('bing.com') && parsed.pathname.startsWith('/ck/a')
          if (!isBingRedirect) return href

          const encoded = parsed.searchParams.get('u')
          if (!encoded) return href

          const normalized = encoded.startsWith('a1') ? encoded.slice(2) : encoded
          const base64 = normalized.replace(/-/g, '+').replace(/_/g, '/')
          const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
          const decoded = atob(padded)

          if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
            return decoded
          }
          return href
        } catch {
          return href
        }
      }

      for (let i = 0; i < Math.min(${count}, searchResultItems.length); i++) {
        const item = searchResultItems[i]
        const linkElement = item.querySelector('h2 a[href^="http"]')
        if (!linkElement || !linkElement.href || linkElement.href.includes('google.com')) {
          continue
        }

        const title = linkElement.textContent?.trim() || 'Untitled'
        const snippetElement = item.querySelector('p, .b_caption p, .b_algoSlug')
        const snippet = snippetElement?.textContent?.trim() || ''

        results.push({
          link: decodeBingRedirect(linkElement.href),
          title,
          snippet
        })
      }

      return results
    })()
  `
}

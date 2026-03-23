import type { SearchEngineDefinition } from './types'

export const googleSearchEngine: SearchEngineDefinition = {
  id: 'google',
  displayName: 'Google',
  buildSearchUrl: (query: string) => `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&gl=us`,
  waitForResultsScript: `document.querySelectorAll('#rso a[href], #search a[href]').length > 0`,
  buildExtractResultsScript: (count: number) => `
    (() => {
      const results = []
      const seen = new Set()
      const anchors = Array.from(document.querySelectorAll('#rso a[href], #search a[href]'))

      const normalizeGoogleResultUrl = (href) => {
        try {
          const parsed = new URL(href, window.location.href)
          if (!['http:', 'https:'].includes(parsed.protocol)) return ''

          const hostname = parsed.hostname.replace(/^www\\./, '')
          if (hostname.endsWith('google.com')) {
            if (parsed.pathname === '/url') {
              const target = parsed.searchParams.get('q') || parsed.searchParams.get('url')
              if (target && /^https?:\\/\\//.test(target)) return target
              return ''
            }

            if (parsed.pathname === '/imgres') {
              const target = parsed.searchParams.get('imgrefurl') || parsed.searchParams.get('url')
              if (target && /^https?:\\/\\//.test(target)) return target
              return ''
            }

            return ''
          }

          return parsed.toString()
        } catch {
          return ''
        }
      }

      const getTitle = (anchor) => {
        const heading =
          anchor.querySelector('h3')
          || anchor.closest('div')?.querySelector('h3')
          || anchor.closest('a')?.querySelector('h3')

        const title = heading?.textContent?.trim() || anchor.textContent?.trim() || ''
        return title.replace(/\\s+/g, ' ').trim()
      }

      const getSnippet = (anchor, title) => {
        const block =
          anchor.closest('div[data-hveid]')
          || anchor.closest('div.g')
          || anchor.closest('div.N54PNb')
          || anchor.closest('div.MjjYud')
          || anchor.parentElement

        const text = (block?.innerText || '').replace(/\\s+/g, ' ').trim()
        if (!text) return ''

        const lines = text
          .split(/\\n+/)
          .map((line) => line.trim())
          .filter(Boolean)

        for (const line of lines) {
          if (line === title) continue
          if (line.length < 20) continue
          return line
        }

        return text === title ? '' : text
      }

      for (const anchor of anchors) {
        if (results.length >= ${count}) break

        const link = normalizeGoogleResultUrl(anchor.href)
        if (!link || seen.has(link)) continue

        const title = getTitle(anchor)
        if (!title || title.length < 3) continue

        const snippet = getSnippet(anchor, title)
        seen.add(link)
        results.push({
          link,
          title,
          snippet
        })
      }

      return results
    })()
  `
}

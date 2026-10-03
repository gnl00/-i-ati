import { net } from 'electron'
import type { SearchEngineDefinition, SearchResultItem } from './types'

function buildGoogleExtractionScript(count: number): string {
  return `
    (() => {
      const results = []
      const seen = new Set()
      const headings = document.querySelectorAll('#rso h3, #search h3, #main h3')
      const normalizeGoogleResultUrl = (href) => {
        try {
          const parsed = new URL(href, window.location.href)
          if (!['http:', 'https:'].includes(parsed.protocol)) return ''
          if (parsed.hostname === 'google.com' || parsed.hostname.endsWith('.google.com')) {
            if (!['/url', '/imgres', '/goto'].includes(parsed.pathname)) return ''
            const target = parsed.searchParams.get('q') || parsed.searchParams.get('imgrefurl') || parsed.searchParams.get('url')
            if (target && /^https?:\\/\\//.test(target)) {
              const destination = new URL(target)
              if (destination.hostname === 'google.com' || destination.hostname.endsWith('.google.com')) return ''
              return destination.toString()
            }
            // Opaque links are resolved from their redirect headers in the main process.
            return parsed.pathname === '/goto' && target ? parsed.toString() : ''
          }
          return parsed.toString()
        } catch {
          return ''
        }
      }
      for (const heading of headings) {
        if (results.length >= ${count}) break
        const anchor = heading.closest('a[href]') || heading.querySelector('a[href]')
        if (!anchor) continue
        const link = normalizeGoogleResultUrl(anchor.href)
        const title = (heading.textContent || '').replace(/\\s+/g, ' ').trim()
        if (!link || seen.has(link) || title.length < 3) continue
        let snippet = ''
        let block = anchor.parentElement
        for (let depth = 0; block && depth < 8; depth++, block = block.parentElement) {
          if (block.querySelectorAll('h3').length > 1) break
          const snippetElement = block.querySelector('.VwiC3b, .IsZvec, [data-sncf]')
          if (snippetElement) {
            snippet = (snippetElement.innerText || snippetElement.textContent || '').replace(/\\s+/g, ' ').trim()
            if (snippet) break
          }
        }
        seen.add(link)
        results.push({ link, title, snippet })
      }
      return results
    })()
  `
}

export const googleSearchEngine: SearchEngineDefinition = {
  id: 'google',
  displayName: 'Google',
  buildSearchUrl: (query: string) => `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&gl=us`,
  waitForResultsScript: `(${buildGoogleExtractionScript(1)}).length > 0`,
  buildExtractResultsScript: buildGoogleExtractionScript
}

function isGoogleUrl(url: URL): boolean {
  return url.hostname === 'google.com' || url.hostname.endsWith('.google.com')
}

/** Resolve opaque Google links without downloading the destination page. */
export async function resolveGoogleResultUrls(
  items: SearchResultItem[], signal: AbortSignal
): Promise<SearchResultItem[]> {
  const resolved = await Promise.all(items.map(async item => {
    const url = new URL(item.link)
    if (!isGoogleUrl(url) || url.pathname !== '/goto') return item
    try {
      const link = await new Promise<string>(resolve => {
        signal.throwIfAborted()
        const request = net.request({ url: item.link, redirect: 'manual' })
        let settled = false
        const finish = (link: string): void => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          signal.removeEventListener('abort', onAbort)
          resolve(link)
          request.abort()
        }
        const onAbort = (): void => finish('')
        const timer = setTimeout(() => finish(''), 5000)
        signal.addEventListener('abort', onAbort, { once: true })
        request.on('redirect', (_status, _method, location) => {
          try {
            const target = new URL(location, item.link)
            if (!['http:', 'https:'].includes(target.protocol)) return finish('')
            if (isGoogleUrl(target)) request.followRedirect()
            else finish(target.toString())
          } catch {
            finish('')
          }
        })
        request.on('response', () => finish(''))
        request.on('error', () => finish(''))
        try { request.end() } catch { finish('') }
      })
      return link ? { ...item, link } : undefined
    } catch {
      return undefined
    }
  }))
  signal.throwIfAborted()
  return resolved.filter((item): item is SearchResultItem => !!item)
}

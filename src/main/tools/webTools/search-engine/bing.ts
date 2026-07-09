import type { SearchEngineDefinition } from './types'

export const bingSearchEngine: SearchEngineDefinition = {
  id: 'bing',
  displayName: 'Bing',
  buildSearchUrl: (query: string) => `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
  waitForResultsScript: `document.querySelectorAll('ol#b_results').length > 0`,
  buildExtractResultsScript: (count: number) => `
    (() => {
      const results = []
      const seen = new Set()
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
          // atob 返回 Latin-1 字节串；Bing 的 u 参数是 UTF-8 字节，含非 ASCII URL
          // （中文域名/路径）时必须按 UTF-8 重新解码，否则乱码。
          const bin = atob(padded)
          const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
          const decoded = new TextDecoder('utf-8').decode(bytes)

          if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
            return decoded
          }
          return href
        } catch {
          return href
        }
      }

      for (let i = 0; i < searchResultItems.length && results.length < ${count}; i++) {
        const item = searchResultItems[i]
        const linkElement = item.querySelector('h2 a[href^="http"]')
        if (!linkElement || !linkElement.href) {
          continue
        }

        const link = decodeBingRedirect(linkElement.href)
        if (!link || seen.has(link)) {
          continue
        }

        // 跳过指向 google.com 的结果链接（Books/Scholar/interstitial 等）：
        // 这类链接进渲染窗口会撞 Google 反爬，产出空/错结果占用结果槽位。
        // 用 hostname 精确判断而非裸 includes('google.com')，避免误杀 URL 里
        // 恰好含 google.com 字样的合法链接。解析失败则保留。
        try {
          const host = new URL(link).hostname
          if (host === 'google.com' || host.endsWith('.google.com')) {
            continue
          }
        } catch {
          // 解析失败，保留该链接
        }

        seen.add(link)

        const title = linkElement.textContent?.trim() || 'Untitled'
        const snippetElement = item.querySelector('p, .b_caption p, .b_algoSlug')
        const snippet = snippetElement?.textContent?.trim() || ''

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

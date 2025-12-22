import { BrowserWindow } from 'electron'
import type { WebSearchResponse, WebSearchResultV2 } from './index.d'

interface WebSearchProcessArgs {
  fetchCounts: number
  param: string
}

interface BingSearchItem {
  link: string
  title: string
  snippet: string
}

const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'

const processWebSearch = async ({ fetchCounts, param }: WebSearchProcessArgs): Promise<WebSearchResponse> => {
  let searchWindow: BrowserWindow | null = null

  try {
    console.log('electron-search action received:', fetchCounts, param);

    // Create a hidden window for search
    searchWindow = new BrowserWindow({
      show: false,
      width: 1366,
      height: 768,
      webPreferences: {
        offscreen: true, // Use offscreen rendering for better performance
        sandbox: false,  // Needed for some advanced operations? usually better to keep true, but let's stick to simple extraction
        webSecurity: false, // Allow cross-origin if needed, though for search it might not be strictly necessary
        images: false, // Disable images to save bandwidth
      }
    })

    // Set user agent
    searchWindow.webContents.setUserAgent(userAgent)

    const searchSite = 'www.bing.com'
    const queryStr = (param as string).trim().replaceAll(' ', '+')
    const searchUrl = `https://${searchSite}/search?q=${queryStr}`

    // Load search page
    await searchWindow.loadURL(searchUrl, { userAgent })

    // Wait for results to be present
    // Simple wait mechanism: check periodically
    await waitForCondition(async () => {
      if (!searchWindow) return false
      return await searchWindow.webContents.executeJavaScript(`
        document.querySelectorAll('ol#b_results').length > 0
      `)
    }, 15000, 500)

    // Extract links, titles, and snippets from Bing search results
    const bingSearchItems: BingSearchItem[] = await searchWindow.webContents.executeJavaScript(`
      (() => {
        const results = []
        const count = ${fetchCounts}
        const searchResultItems = document.querySelectorAll('ol#b_results li.b_algo')

        for (let i = 0; i < Math.min(count, searchResultItems.length); i++) {
          const item = searchResultItems[i]

          // 提取链接
          const linkElement = item.querySelector('h2 a[href^="http"]')
          if (!linkElement || !linkElement.href || linkElement.href.includes('google.com')) {
            continue
          }

          // 提取标题（来自搜索结果）
          const title = linkElement.textContent?.trim() || 'Untitled'

          // 提取摘要（来自搜索结果描述）
          const snippetElement = item.querySelector('p, .b_caption p, .b_algoSlug')
          const snippet = snippetElement?.textContent?.trim() || ''

          results.push({
            link: linkElement.href,
            title: title,
            snippet: snippet
          })
        }

        return results
      })()
    `)

    // console.log('Extracted Bing search items:', bingSearchItems)

    // Close search window early to free resources
    if (searchWindow) {
      searchWindow.close()
      searchWindow = null
    }

    // Process each search item: scrape full content and extract metadata
    const scrapedResults: WebSearchResultV2[] = await Promise.all(
      bingSearchItems.map(async (item: BingSearchItem): Promise<WebSearchResultV2> => {
        let contentWindow: BrowserWindow | null = null

        // 初始化结果对象
        const resultItem: WebSearchResultV2 = {
          query: param as string,
          success: false,
          link: item.link,
          title: item.title,      // 默认使用 Bing 标题
          snippet: item.snippet,
          content: '',
          error: undefined
        }

        try {
          contentWindow = new BrowserWindow({
            show: false,
            webPreferences: {
              offscreen: true,
              images: false,
              webSecurity: false
            }
          })
          contentWindow.webContents.setUserAgent(userAgent)

          // 设置加载超时
          const timeoutId = setTimeout(() => {
            if (contentWindow && !contentWindow.isDestroyed()) {
              contentWindow.webContents.stop()
            }
          }, 15000)

          await contentWindow.loadURL(item.link, { userAgent })
          clearTimeout(timeoutId)

          // 提取页面标题、URL 和内容
          const { pageTitle, finalUrl, extractedText } = await contentWindow.webContents.executeJavaScript(`
            (() => {
              // 获取页面标题（覆盖 Bing 标题）
              const pageTitle = document.title || ''

              // 获取最终的 URL（经过重定向后的真实 URL）
              const finalUrl = window.location.href

              // 移除噪声元素（保持现有逻辑）
              const noiseSelectors = [
                'script', 'style', 'nav', 'header', 'footer',
                '.ad', '.advertisement', '.sidebar', '.comments',
                '[class*="related"]', '[class*="recommend"]',
                'iframe', 'noscript'
              ]
              noiseSelectors.forEach(sel => {
                document.querySelectorAll(sel).forEach(el => el.remove())
              })

              // 提取主要内容（保持现有逻辑）
              const mainSelectors = [
                'main', 'article', '[role="main"]', '.content', '.main-content', '#content', '#main'
              ]

              let mainContent = null
              for (const selector of mainSelectors) {
                mainContent = document.querySelector(selector)
                if (mainContent) break
              }

              const targetElement = mainContent || document.body
              const extractedText = targetElement.innerText || targetElement.textContent || ''

              return { pageTitle, finalUrl, extractedText }
            })()
          `)

          // 更新结果对象
          resultItem.link = finalUrl  // 更新为真正的目标 URL
          resultItem.title = pageTitle || item.title  // 优先使用页面标题
          resultItem.content = postClean(extractedText)
          resultItem.success = true

          console.log('Scraping completed, results:', JSON.stringify({ link: resultItem.link, title: resultItem.title, success: resultItem.success }))

          return resultItem

        } catch (err: any) {
          console.error(`Error scraping ${item.link}:`, err.message)
          resultItem.success = false
          resultItem.error = err.message || 'Failed to fetch page'
          return resultItem

        } finally {
          if (contentWindow && !contentWindow.isDestroyed()) {
            contentWindow.close()
          }
        }
      })
    )

    console.log('Scraping completed, counts:', scrapedResults.length)

    return {
      success: true,
      results: scrapedResults
    }

  } catch (error: any) {
    console.error('electron-web-search error:', error)
    return {
      success: false,
      results: [],
      error: error.message || 'Search operation failed'
    }
  } finally {
    if (searchWindow) {
      searchWindow.close()
    }
  }
}

// Helper: Polling wait
function waitForCondition(checkFn: () => Promise<boolean>, timeout: number, interval: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now()
    const timer = setInterval(async () => {
      try {
        if (await checkFn()) {
          clearInterval(timer)
          resolve()
        } else if (Date.now() - startTime > timeout) {
          clearInterval(timer)
          reject(new Error('Timeout waiting for condition'))
        }
      } catch (e) {
        // If checkFn fails (e.g. window closed), we might want to stop
        clearInterval(timer)
        reject(e)
      }
    }, interval)
  })
}

function postClean(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 2)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/(分享到|广告|推广|Copyright|备案号|关注我们|订阅|Newsletter).*$/gim, '')
    .trim()
}

export {
  processWebSearch
}

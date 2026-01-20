import { BrowserWindow } from 'electron'
import * as cheerio from 'cheerio'
import TurndownService from 'turndown'
import type { WebSearchResponse, WebSearchResultV2, WebFetchResponse } from '@tools/webTools/index.d'
import { getWindowPool } from './BrowserWindowPool'

interface WebSearchProcessArgs {
  fetchCounts?: number
  param?: string
  query?: string
  snippetsOnly?: boolean
}

interface WebFetchProcessArgs {
  url: string
}

interface BingSearchItem {
  link: string
  title: string
  snippet: string
}

const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'

/**
 * 创建并配置 Turndown 实例
 */
function createTurndownService(): TurndownService {
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*'
  })

  // 移除不需要的元素
  turndownService.remove(['script', 'style', 'noscript'])

  return turndownService
}

/**
 * 使用 Cheerio 提取和清理 HTML 内容
 * @param html 原始 HTML 字符串
 * @returns 清理后的 HTML 字符串
 */
function extractContentWithCheerio(html: string): string {
  try {
    // 加载 HTML
    const $ = cheerio.load(html)

    // 移除噪声元素
    const noiseSelectors = [
      'script',
      'style',
      'nav',
      'header',
      'footer',
      '.ad',
      '.advertisement',
      '.sidebar',
      '.comments',
      '[class*="related"]',
      '[class*="recommend"]',
      '[class*="hot"]',
      'iframe',
      'noscript'
    ]

    noiseSelectors.forEach(selector => {
      $(selector).remove()
    })

    // 查找主要内容区域
    const mainSelectors = [
      'main',
      'article',
      '[role="main"]',
      '.content',
      '.main-content',
      '#content',
      '#main'
    ]

    let mainContent: cheerio.Cheerio<any> | null = null
    for (const selector of mainSelectors) {
      const element = $(selector)
      if (element.length > 0) {
        mainContent = element
        break
      }
    }

    // 提取文本内容
    const targetElement = mainContent || $('body')

    // 返回清理后的 HTML（用于 Markdown 转换）
    const cleanedHtml = targetElement.html() || ''
    return cleanedHtml
  } catch (error) {
    console.error('[Cheerio] Error extracting content:', error)
    return ''
  }
}

/**
 * 将 HTML 转换为 Markdown
 * @param html 清理后的 HTML 字符串
 * @returns Markdown 格式的文本
 */
function convertHtmlToMarkdown(html: string): string {
  try {
    const turndownService = createTurndownService()
    const markdown = turndownService.turndown(html)
    return markdown
  } catch (error) {
    console.error('[Turndown] Error converting to markdown:', error)
    // 如果转换失败，返回纯文本
    const $ = cheerio.load(html)
    return $('body').text()
  }
}

/**
 * 从指定 URL 获取页面内容
 * 使用 BrowserWindow 渲染页面，然后用 Cheerio 在 Node.js 端处理
 * @param url 要获取的页面 URL
 * @param contentWindow 用于加载页面的 BrowserWindow
 * @returns 包含页面标题、最终 URL 和提取的文本内容
 */
async function fetchPageContent(url: string, contentWindow: BrowserWindow): Promise<{
  pageTitle: string
  finalUrl: string
  extractedText: string
}> {
  // 设置加载超时
  const timeoutId = setTimeout(() => {
    if (contentWindow && !contentWindow.isDestroyed()) {
      contentWindow.webContents.stop()
    }
  }, 15000)

  await contentWindow.loadURL(url, { userAgent })
  clearTimeout(timeoutId)

  // 只提取必要的原始数据：HTML、URL、标题
  // 直接使用 document.body，让 Cheerio 负责所有过滤工作
  const pageData = await contentWindow.webContents.executeJavaScript(`
    ({
      html: document.body ? document.body.outerHTML : '',
      finalUrl: window.location.href,
      title: document.title || ''
    })
  `)

  // 使用 Cheerio 在 Node.js 端处理 HTML
  const cleanedHtml = extractContentWithCheerio(pageData.html)

  // 将 HTML 转换为 Markdown
  const markdown = convertHtmlToMarkdown(cleanedHtml)

  // 使用 postClean 进行最终清理
  const extractedText = postClean(markdown)

  return {
    pageTitle: pageData.title,
    finalUrl: pageData.finalUrl,
    extractedText
  }
}

/**
 * Web Search - 执行网页搜索
 */
const processWebSearch = async ({
  fetchCounts,
  param,
  query,
  snippetsOnly
}: WebSearchProcessArgs): Promise<WebSearchResponse> => {
  const searchStartTime = Date.now()
  const windowPool = getWindowPool()
  let searchWindow: BrowserWindow | null = null

  try {
    const rawQuery = param ?? query ?? ''
    const trimmedQuery = typeof rawQuery === 'string' ? rawQuery.trim() : String(rawQuery).trim()
    if (!trimmedQuery) {
      return { success: false, results: [], error: 'query is required' }
    }
    const resolvedFetchCounts = typeof fetchCounts === 'number' && fetchCounts > 0 ? fetchCounts : 3

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`[SEARCH START] Query: "${trimmedQuery}", Count: ${resolvedFetchCounts}, SnippetsOnly: ${Boolean(snippetsOnly)}`)
    console.log(`[SEARCH START] Timestamp: ${new Date().toISOString()}`)

    // Acquire a search window from the pool
    const windowCreateStart = Date.now()
    searchWindow = await windowPool.acquireSearchWindow()
    const windowCreateTime = Date.now() - windowCreateStart
    console.log(`[WINDOW ACQUIRE] Search window acquired in ${windowCreateTime}ms`)

    const searchSite = 'www.bing.com'
    const queryStr = trimmedQuery.replaceAll(' ', '+')
    const searchUrl = `https://${searchSite}/search?q=${queryStr}`

    // Load search page
    const pageLoadStart = Date.now()
    await searchWindow.loadURL(searchUrl, { userAgent })
    const pageLoadTime = Date.now() - pageLoadStart
    console.log(`[PAGE LOAD] Bing search page loaded in ${pageLoadTime}ms`)

    // Wait for results to be present
    const waitStart = Date.now()
    await waitForCondition(async () => {
      if (!searchWindow) return false
      return await searchWindow.webContents.executeJavaScript(`
        document.querySelectorAll('ol#b_results').length > 0
      `)
    }, 15000, 500)
    const waitTime = Date.now() - waitStart
    console.log(`[WAIT RESULTS] Waited ${waitTime}ms for search results`)

    // Extract links, titles, and snippets from Bing search results
    const extractStart = Date.now()
    const searchItems: BingSearchItem[] = await searchWindow.webContents.executeJavaScript(`
      (() => {
        const results = []
        const count = ${resolvedFetchCounts}
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
    const extractTime = Date.now() - extractStart
    console.log(`[EXTRACT] Extracted ${searchItems.length} items in ${extractTime}ms`)

    // Release search window back to pool
    if (searchWindow) {
      windowPool.releaseSearchWindow(searchWindow)
      searchWindow = null
    }

    // Snippets only mode: return titles/snippets/links without fetching full pages
    if (snippetsOnly) {
      const totalTime = Date.now() - searchStartTime
      console.log(`[SEARCH COMPLETE - SNIPPETS ONLY] Total time: ${totalTime}ms`)
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

      return {
        success: true,
        results: searchItems.map((item): WebSearchResultV2 => ({
          query: param as string,
          success: true,
          link: item.link,
          title: item.title,
          snippet: item.snippet,
          // No need to use snippet as content fallback, assistant will mis-understand content and snippet
          content: ''
        }))
      }
    }

    // Process each search item: scrape full content and extract metadata
    console.log(`[SCRAPE START] Starting parallel content scraping for ${searchItems.length} pages`)
    const scrapeStart = Date.now()
    const scrapedResults: WebSearchResultV2[] = await Promise.all(
      searchItems.map(async (item: BingSearchItem, index: number): Promise<WebSearchResultV2> => {
        const itemStart = Date.now()
        let contentWindow: BrowserWindow | null = null

        const resultItem: WebSearchResultV2 = {
          query: param as string,
          success: false,
          link: item.link,
          title: item.title,
          snippet: item.snippet,
          content: '',
          error: undefined
        }

        try {
          const contentWindowStart = Date.now()
          contentWindow = await windowPool.acquireContentWindow()
          const contentWindowTime = Date.now() - contentWindowStart
          console.log(`[SCRAPE ${index + 1}] Content window #${index + 1} acquired in ${contentWindowTime}ms`)

          const contentLoadStart = Date.now()
          const { pageTitle, finalUrl, extractedText } = await fetchPageContent(item.link, contentWindow)
          const contentLoadTime = Date.now() - contentLoadStart
          console.log(`[SCRAPE ${index + 1}] Page loaded in ${contentLoadTime}ms - ${item.link}`)

          resultItem.link = finalUrl
          resultItem.title = pageTitle || item.title
          resultItem.content = postClean(extractedText)
          resultItem.success = true

          const itemTime = Date.now() - itemStart
          console.log(`[SCRAPE ${index + 1}] Completed in ${itemTime}ms total`)

          return resultItem

        } catch (err: any) {
          console.error(`Error scraping ${item.link}:`, err.message)
          resultItem.success = false
          resultItem.error = err.message || 'Failed to fetch page'
          return resultItem

        } finally {
          if (contentWindow && !contentWindow.isDestroyed()) {
            windowPool.releaseContentWindow(contentWindow)
          }
        }
      })
    )

    const scrapeTime = Date.now() - scrapeStart
    console.log(`[SCRAPE COMPLETE] All ${searchItems.length} pages scraped in ${scrapeTime}ms`)

    const totalTime = Date.now() - searchStartTime
    console.log(`[SEARCH COMPLETE] Total time: ${totalTime}ms`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

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
      windowPool.releaseSearchWindow(searchWindow)
    }
  }
}

/**
 * Web Fetch - 获取指定 URL 的页面内容
 */
const processWebFetch = async ({ url }: WebFetchProcessArgs): Promise<WebFetchResponse> => {
  const fetchStartTime = Date.now()
  const windowPool = getWindowPool()
  let contentWindow: BrowserWindow | null = null

  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`[WEB FETCH START] URL: "${url}"`)
    console.log(`[WEB FETCH START] Timestamp: ${new Date().toISOString()}`)

    const windowCreateStart = Date.now()
    contentWindow = await windowPool.acquireContentWindow()
    const windowCreateTime = Date.now() - windowCreateStart
    console.log(`[WINDOW ACQUIRE] Content window acquired in ${windowCreateTime}ms`)

    const fetchStart = Date.now()
    const { pageTitle, finalUrl, extractedText } = await fetchPageContent(url, contentWindow)
    const fetchTime = Date.now() - fetchStart
    console.log(`[PAGE FETCH] Page fetched in ${fetchTime}ms`)

    const cleanedContent = postClean(extractedText)

    const totalTime = Date.now() - fetchStartTime
    console.log(`[WEB FETCH COMPLETE] Total time: ${totalTime}ms`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    return {
      success: true,
      url: finalUrl,
      title: pageTitle,
      content: cleanedContent
    }

  } catch (error: any) {
    console.error('web-fetch error:', error)
    return {
      success: false,
      url: url,
      title: '',
      content: '',
      error: error.message || 'Failed to fetch page'
    }
  } finally {
    if (contentWindow && !contentWindow.isDestroyed()) {
      windowPool.releaseContentWindow(contentWindow)
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
  processWebSearch,
  processWebFetch
}

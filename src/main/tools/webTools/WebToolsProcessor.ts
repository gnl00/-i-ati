import { BrowserWindow } from 'electron'
import * as cheerio from 'cheerio'
import TurndownService from 'turndown'
import type { WebSearchResponse, WebSearchResultV2, WebFetchResponse } from '@tools/webTools/index.d'
import { getWindowPool } from './BrowserWindowPool'
import DatabaseService from '@main/db/DatabaseService'
import { createLogger } from '@main/logging/LogService'
import { resolveSearchEngine, type SearchResultItem } from './search-engine'

interface WebSearchProcessArgs {
  engine?: 'bing' | 'google'
  fetchCounts?: number
  param?: string
  query?: string
  snippetsOnly?: boolean
}

type CleanMode = 'lite' | 'full'

interface WebFetchProcessArgs {
  url: string
  cleanMode?: CleanMode
}

interface PageSnapshot {
  currentUrl: string
  title: string
  bodyPreview: string
}

type GooglePageKind = 'result' | 'anti_bot' | 'consent' | 'unknown'

const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
const directHttpExtensions = new Set([
  '.md',
  '.markdown',
  '.txt',
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.csv',
  '.xml',
  '.log'
])

const logger = createLogger('WebToolsProcessor')

function getFallbackTitleFromUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const pathname = parsed.pathname || ''
    const filename = pathname.split('/').pop() || ''
    return decodeURIComponent(filename) || parsed.hostname
  } catch {
    return ''
  }
}

function shouldPreferDirectHttpFetch(url: string): boolean {
  try {
    const parsed = new URL(url)
    const pathname = parsed.pathname.toLowerCase()
    const lastDotIndex = pathname.lastIndexOf('.')
    const ext = lastDotIndex >= 0 ? pathname.slice(lastDotIndex) : ''

    if (directHttpExtensions.has(ext)) return true
    if (parsed.hostname === 'raw.githubusercontent.com') return true
    if (parsed.searchParams.get('raw') === '1') return true
    return false
  } catch {
    return false
  }
}

function withTimeout<T>(
  task: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
  onTimeout?: () => void
): Promise<T> {
  let timer: NodeJS.Timeout | null = null

  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      try {
        onTimeout?.()
      } catch (err) {
        logger.warn('timeout_hook.failed', err)
      }
      reject(new Error(timeoutMessage))
    }, timeoutMs)
  })

  return Promise.race([task, timeoutPromise]).finally(() => {
    if (timer) {
      clearTimeout(timer)
    }
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isExpectedSearchResultUrl(engine: 'bing' | 'google', currentUrl: string): boolean {
  try {
    const parsed = new URL(currentUrl)
    const hostname = parsed.hostname.replace(/^www\./, '')
    if (engine === 'google') {
      return hostname.endsWith('google.com') && parsed.pathname === '/search'
    }
    return hostname.endsWith('bing.com') && parsed.pathname === '/search'
  } catch {
    return false
  }
}

async function capturePageSnapshot(window: BrowserWindow): Promise<PageSnapshot> {
  try {
    const snapshot = await window.webContents.executeJavaScript(`
      ({
        currentUrl: window.location.href,
        title: document.title || '',
        bodyPreview: (document.body?.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 300)
      })
    `)

    return {
      currentUrl: typeof snapshot?.currentUrl === 'string' ? snapshot.currentUrl : '',
      title: typeof snapshot?.title === 'string' ? snapshot.title : '',
      bodyPreview: typeof snapshot?.bodyPreview === 'string' ? snapshot.bodyPreview : ''
    }
  } catch {
    return {
      currentUrl: window.webContents.getURL() || '',
      title: '',
      bodyPreview: ''
    }
  }
}

function classifyGoogleSearchPage(snapshot: PageSnapshot): GooglePageKind {
  const currentUrl = snapshot.currentUrl.toLowerCase()
  const title = snapshot.title.toLowerCase()
  const body = snapshot.bodyPreview.toLowerCase()
  const combined = `${title}\n${body}`

  if (currentUrl.includes('/sorry/') || currentUrl.includes('sorry/index')) {
    return 'anti_bot'
  }

  const antiBotSignals = [
    'unusual traffic',
    'verify you are human',
    'not a robot',
    'captcha',
    'detected unusual traffic',
    '验证您是否是真人',
    '验证您不是机器人',
    '不是机器人'
  ]
  if (antiBotSignals.some(signal => combined.includes(signal))) {
    return 'anti_bot'
  }

  const consentSignals = [
    'before you continue to google',
    'before you continue',
    'accept all',
    'reject all',
    'i agree',
    'cookies',
    '在继续之前',
    '接受全部',
    '拒绝全部'
  ]
  if (
    currentUrl.includes('consent.google.com')
    || consentSignals.some(signal => combined.includes(signal))
  ) {
    return 'consent'
  }

  if (isExpectedSearchResultUrl('google', snapshot.currentUrl)) {
    return 'result'
  }

  return 'unknown'
}

async function waitForManualGoogleVerification(window: BrowserWindow): Promise<PageSnapshot> {
  logger.warn('search_verification.manual_required')
  window.show()
  window.focus()

  await waitForCondition(async () => {
    const snapshot = await capturePageSnapshot(window)
    const kind = classifyGoogleSearchPage(snapshot)
    return kind === 'result'
  }, 120000, 1000)

  const snapshot = await capturePageSnapshot(window)
  logger.info('search_verification.completed', {
    currentUrl: snapshot.currentUrl,
    title: snapshot.title,
    bodyPreview: snapshot.bodyPreview
  })

  if (!window.isDestroyed()) {
    window.hide()
  }

  return snapshot
}

async function loadSearchPage(
  window: BrowserWindow,
  searchUrl: string,
  engine: 'bing' | 'google'
): Promise<PageSnapshot> {
  try {
    await window.loadURL(searchUrl, { userAgent })
    return await capturePageSnapshot(window)
  } catch (error: any) {
    if (engine !== 'google' || error?.code !== 'ERR_ABORTED') {
      throw error
    }

    await sleep(600)
    const snapshot = await capturePageSnapshot(window)
    if (isExpectedSearchResultUrl(engine, snapshot.currentUrl)) {
      logger.warn('search_load.google_redirect_aborted_but_recovered', {
        requestedUrl: searchUrl,
        currentUrl: snapshot.currentUrl,
        title: snapshot.title
      })
      return snapshot
    }

    logger.warn('search_load.google_redirect_aborted_unexpected_page', {
      requestedUrl: searchUrl,
      currentUrl: snapshot.currentUrl,
      title: snapshot.title,
      bodyPreview: snapshot.bodyPreview
    })
    throw error
  }
}

function resolveConfiguredFetchCounts(fetchCounts?: number): number {
  if (typeof fetchCounts === 'number' && fetchCounts > 0) {
    return fetchCounts
  }

  try {
    const configured = DatabaseService.getConfig()?.tools?.maxWebSearchItems
    if (typeof configured === 'number' && configured > 0) {
      return configured
    }
  } catch (error) {
    logger.warn('web_search.read_max_items_config_failed', error)
  }

  return 3
}

async function fetchPageContentViaHttp(
  fallbackUrl: string,
  mode: CleanMode
): Promise<{ pageTitle: string; finalUrl: string; extractedText: string }> {
  const response = await fetch(fallbackUrl, {
    redirect: 'follow',
    headers: {
      'User-Agent': userAgent,
      'Accept': 'text/html, text/plain, text/markdown, application/xhtml+xml, application/xml;q=0.9, */*;q=0.8'
    }
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch page: HTTP ${response.status}`)
  }

  const finalUrl = response.url || fallbackUrl
  const contentType = (response.headers.get('content-type') || '').toLowerCase()
  const bodyText = await response.text()
  const fallbackTitle = getFallbackTitleFromUrl(finalUrl)

  if (contentType.includes('html') || bodyText.includes('<html') || bodyText.includes('<body')) {
    const $ = cheerio.load(bodyText)
    const pageTitle = $('title').first().text().trim() || fallbackTitle
    const cleanedHtml = extractContentWithCheerio(bodyText)
    const markdown = convertHtmlToMarkdown(cleanedHtml, mode)
    return {
      pageTitle,
      finalUrl,
      extractedText: mode === 'full' ? postCleanFull(markdown) : postCleanLite(markdown)
    }
  }

  return {
    pageTitle: fallbackTitle,
    finalUrl,
    extractedText: mode === 'full' ? postCleanFull(bodyText) : postCleanLite(bodyText)
  }
}

/**
 * 创建并配置 Turndown 实例
 */
function createTurndownService(mode: CleanMode): TurndownService {
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*'
  })

  // 移除不需要的元素
  turndownService.remove(['script', 'style', 'noscript'])

  turndownService.addRule('emptyLinks', {
    filter: (node) => {
      return node.nodeName === 'A' && !node.textContent?.trim()
    },
    replacement: () => ''
  })

  turndownService.addRule('emptyImages', {
    filter: (node) => {
      return node.nodeName === 'IMG' && !node.getAttribute('alt') && !node.getAttribute('title')
    },
    replacement: () => ''
  })

  if (mode === 'lite') {
    turndownService.addRule('trimLongCodeBlocks', {
      filter: (node) => node.nodeName === 'PRE',
      replacement: (content) => {
        const trimmed = content.trim()
        if (trimmed.length > 4000) {
          return `${trimmed.slice(0, 4000)}\n...`
        }
        return `\n\n${trimmed}\n\n`
      }
    })
  }

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
      'aside',
      '.ad',
      '.advertisement',
      '.sidebar',
      '.comments',
      '.comment',
      '.share',
      '.sharing',
      '.social',
      '.subscribe',
      '.newsletter',
      '.cookie',
      '.consent',
      '[class*="related"]',
      '[class*="recommend"]',
      '[class*="promo"]',
      '[class*="sponsor"]',
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
      '[itemprop="articleBody"]',
      '[data-testid="article-body"]',
      '[data-content="article"]',
      '[role="main"]',
      '.content',
      '.main-content',
      '.post',
      '.post-content',
      '.entry-content',
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
    logger.error('cheerio_extract.failed', error)
    return ''
  }
}

/**
 * 将 HTML 转换为 Markdown
 * @param html 清理后的 HTML 字符串
 * @returns Markdown 格式的文本
 */
function convertHtmlToMarkdown(html: string, mode: CleanMode): string {
  try {
    const turndownService = createTurndownService(mode)
    const markdown = turndownService.turndown(html)
    return markdown
  } catch (error) {
    logger.error('turndown_convert.failed', error)
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
async function fetchPageContent(
  url: string,
  contentWindow: BrowserWindow,
  mode: CleanMode
): Promise<{
  pageTitle: string
  finalUrl: string
  extractedText: string
}> {
  try {
    await withTimeout(
      contentWindow.loadURL(url, { userAgent }),
      15000,
      `Timeout loading page: ${url}`,
      () => {
        if (contentWindow && !contentWindow.isDestroyed()) {
          contentWindow.webContents.stop()
        }
      }
    )
  } catch (error: any) {
    logger.warn('web_fetch.load_url_failed_fallback_http', {
      url,
      message: error?.message || String(error)
    })
    return await fetchPageContentViaHttp(url, mode)
  }

  try {
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
    const markdown = convertHtmlToMarkdown(cleanedHtml, mode)

    // 使用 postClean 进行最终清理
    const extractedText = mode === 'full' ? postCleanFull(markdown) : postCleanLite(markdown)

    return {
      pageTitle: pageData.title,
      finalUrl: pageData.finalUrl,
      extractedText
    }
  } catch (error: any) {
    const currentUrl = contentWindow.webContents.getURL() || url
    logger.warn('web_fetch.extract_js_failed_fallback_http', {
      url: currentUrl,
      message: error?.message || String(error)
    })
    return await fetchPageContentViaHttp(currentUrl, mode)
  }
}

/**
 * Web Search - 执行网页搜索
 */
const processWebSearch = async ({
  engine,
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
    const resolvedQuery = trimmedQuery
    const resolvedFetchCounts = resolveConfiguredFetchCounts(fetchCounts)
    const searchEngine = resolveSearchEngine(engine)

    logger.info('web_search.started', {
      engine: searchEngine.displayName,
      query: trimmedQuery,
      fetchCounts: resolvedFetchCounts,
      snippetsOnly: Boolean(snippetsOnly),
      timestamp: new Date().toISOString()
    })

    // Acquire a search window from the pool
    const windowCreateStart = Date.now()
    searchWindow = await windowPool.acquireSearchWindow()
    const windowCreateTime = Date.now() - windowCreateStart
    logger.info('web_search.search_window_acquired', {
      engine: searchEngine.displayName,
      durationMs: windowCreateTime
    })

    const searchUrl = searchEngine.buildSearchUrl(trimmedQuery)

    // Load search page
    const pageLoadStart = Date.now()
    const pageSnapshot = await loadSearchPage(searchWindow, searchUrl, searchEngine.id)
    const pageLoadTime = Date.now() - pageLoadStart
    logger.info('web_search.page_loaded', {
      engine: searchEngine.displayName,
      durationMs: pageLoadTime
    })
    logger.info('web_search.page_snapshot', {
      engine: searchEngine.displayName,
      currentUrl: pageSnapshot.currentUrl,
      title: pageSnapshot.title,
      bodyPreview: pageSnapshot.bodyPreview
    })

    if (searchEngine.id === 'google') {
      const pageKind = classifyGoogleSearchPage(pageSnapshot)
      logger.info('web_search.google_page_classified', {
        engine: searchEngine.displayName,
        kind: pageKind,
        currentUrl: pageSnapshot.currentUrl
      })

      if (pageKind === 'anti_bot' || pageKind === 'consent') {
        const verifiedSnapshot = await waitForManualGoogleVerification(searchWindow)
        logger.info('web_search.page_snapshot_after_verification', {
          engine: searchEngine.displayName,
          currentUrl: verifiedSnapshot.currentUrl,
          title: verifiedSnapshot.title,
          bodyPreview: verifiedSnapshot.bodyPreview
        })
      }
    }

    // Wait for results to be present
    const waitStart = Date.now()
    await waitForCondition(async () => {
      if (!searchWindow) return false
      return await searchWindow.webContents.executeJavaScript(searchEngine.waitForResultsScript)
    }, 15000, 500)
    const waitTime = Date.now() - waitStart
    logger.info('web_search.results_ready', {
      engine: searchEngine.displayName,
      durationMs: waitTime
    })

    // Extract links, titles, and snippets from search results
    const extractStart = Date.now()
    const searchItems: SearchResultItem[] = await searchWindow.webContents.executeJavaScript(
      searchEngine.buildExtractResultsScript(resolvedFetchCounts)
    )
    const extractTime = Date.now() - extractStart
    logger.info('web_search.results_extracted', {
      engine: searchEngine.displayName,
      count: searchItems.length,
      durationMs: extractTime
    })

    // Release search window back to pool
    if (searchWindow) {
      windowPool.releaseSearchWindow(searchWindow)
      searchWindow = null
    }

    // Snippets only mode: return titles/snippets/links without fetching full pages
    if (snippetsOnly) {
      const totalTime = Date.now() - searchStartTime
      logger.info('web_search.completed_snippets_only', {
        engine: searchEngine.displayName,
        count: searchItems.length,
        durationMs: totalTime
      })

      return {
        success: true,
        results: searchItems.map((item): WebSearchResultV2 => ({
          query: resolvedQuery,
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
    logger.info('web_search.scrape_started', {
      engine: searchEngine.displayName,
      count: searchItems.length
    })
    const scrapeStart = Date.now()
    const scrapedResults: WebSearchResultV2[] = await Promise.all(
      searchItems.map(async (item: SearchResultItem, index: number): Promise<WebSearchResultV2> => {
        const itemStart = Date.now()
        let contentWindow: BrowserWindow | null = null

        const resultItem: WebSearchResultV2 = {
          query: resolvedQuery,
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
          logger.debug('web_search.scrape_item_content_window_acquired', {
            engine: searchEngine.displayName,
            index: index + 1,
            link: item.link,
            durationMs: contentWindowTime
          })

          const contentLoadStart = Date.now()
          const { pageTitle, finalUrl, extractedText } = await withTimeout(
            fetchPageContent(item.link, contentWindow, 'lite'),
            22000,
            `Timeout scraping page: ${item.link}`,
            () => {
              if (contentWindow && !contentWindow.isDestroyed()) {
                contentWindow.webContents.stop()
              }
            }
          )
          const contentLoadTime = Date.now() - contentLoadStart
          logger.debug('web_search.scrape_item_page_loaded', {
            engine: searchEngine.displayName,
            index: index + 1,
            link: item.link,
            durationMs: contentLoadTime
          })

          resultItem.link = finalUrl
          resultItem.title = pageTitle || item.title
          resultItem.content = extractedText
          resultItem.success = true

          const itemTime = Date.now() - itemStart
          logger.debug('web_search.scrape_item_completed', {
            engine: searchEngine.displayName,
            index: index + 1,
            link: resultItem.link,
            durationMs: itemTime
          })

          return resultItem

        } catch (err: any) {
          logger.warn('web_search.scrape_item_failed', {
            engine: searchEngine.displayName,
            index: index + 1,
            link: item.link,
            message: err?.message || 'Failed to fetch page'
          })
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
    logger.info('web_search.scrape_completed', {
      engine: searchEngine.displayName,
      count: searchItems.length,
      durationMs: scrapeTime
    })

    const totalTime = Date.now() - searchStartTime
    logger.info('web_search.completed', {
      engine: searchEngine.displayName,
      count: scrapedResults.length,
      durationMs: totalTime
    })

    return {
      success: true,
      results: scrapedResults
    }

  } catch (error: any) {
    logger.error('web_search.failed', error)
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
const processWebFetch = async ({ url, cleanMode }: WebFetchProcessArgs): Promise<WebFetchResponse> => {
  const fetchStartTime = Date.now()
  const windowPool = getWindowPool()
  let contentWindow: BrowserWindow | null = null

  try {
    logger.info('web_fetch.started', {
      url,
      cleanMode: cleanMode === 'full' ? 'full' : 'lite',
      timestamp: new Date().toISOString()
    })

    const mode = cleanMode === 'full' ? 'full' : 'lite'
    let pageTitle = ''
    let finalUrl = url
    let extractedText = ''

    if (shouldPreferDirectHttpFetch(url)) {
      logger.info('web_fetch.mode_direct_http', { url })
      const fetchStart = Date.now()
      const direct = await fetchPageContentViaHttp(url, mode)
      pageTitle = direct.pageTitle
      finalUrl = direct.finalUrl
      extractedText = direct.extractedText
      const fetchTime = Date.now() - fetchStart
      logger.info('web_fetch.direct_http_completed', {
        url: finalUrl,
        durationMs: fetchTime
      })
    } else {
      const windowCreateStart = Date.now()
      contentWindow = await windowPool.acquireContentWindow()
      const windowCreateTime = Date.now() - windowCreateStart
      logger.info('web_fetch.content_window_acquired', {
        url,
        durationMs: windowCreateTime
      })

      const fetchStart = Date.now()
      const fetched = await fetchPageContent(url, contentWindow, mode)
      pageTitle = fetched.pageTitle
      finalUrl = fetched.finalUrl
      extractedText = fetched.extractedText
      const fetchTime = Date.now() - fetchStart
      logger.info('web_fetch.page_fetched', {
        url: finalUrl,
        durationMs: fetchTime
      })
    }

    const cleanedContent = extractedText

    const totalTime = Date.now() - fetchStartTime
    logger.info('web_fetch.completed', {
      url: finalUrl,
      durationMs: totalTime
    })

    return {
      success: true,
      url: finalUrl,
      title: pageTitle,
      content: cleanedContent
    }

  } catch (error: any) {
    logger.error('web_fetch.failed', error)
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

function postCleanLite(text: string): string {
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

function postCleanFull(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export {
  processWebSearch,
  processWebFetch
}

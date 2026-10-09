import type { EmbeddedToolExecutionContext } from '@shared/tools/registry'
import type { BrowserWindow, DownloadItem, Event, WebContents } from 'electron'
import { mainWindow } from '@main/main-window'
import type { WebSearchResponse, WebSearchResultV2, WebFetchResponse } from '@tools/webTools/index.d'
import { getWindowPool } from './BrowserWindowPool'
import { configDb } from '@main/db/config'
import { createLogger } from '@main/logging/LogService'
import {
  resolveSearchEngine,
  type SearchEngineId,
  type SearchResultItem
} from './search-engine'
import { selectSearchResults } from './search-engine/selectResults'
import { resolveGoogleResultUrls } from './search-engine/google'
import { waitForCondition } from './util/waitForCondition'
import { PAGE_CONTENT_SNAPSHOT_SCRIPT, waitForPageContent } from './util/waitForPageContent'
import { assertUsableWebContent, extractCleanContent } from './extract/ContentExtractor'
import type { CleanMode } from './extract/postClean'
import { downloadViaHttp } from './http/HttpFetcher'
import { WEB_FETCH_INLINE_MAX_CHARACTERS } from './artifacts/constants'
import { WorkspaceWebFetchArtifactService } from './artifacts/WorkspaceWebFetchArtifactService'
import {
  WebFetchContentMaterializer,
  type MaterializedWebContent
} from './artifacts/WebFetchContentMaterializer'

interface WebSearchProcessArgs {
  engine?: SearchEngineId
  fetchCounts?: number
  param?: string
  query?: string
  // 是否允许弹窗人工验证（Google 反爬/consent）。默认 false：后台/LLM 调用不弹窗死等，
  // 降级到 Bing。仅 renderer 用户主动搜索时透传 true。
  interactive?: boolean
  // 内部递归防护：反爬降级到 Bing 的重试深度，避免无限递归
  _fallbackDepth?: number
}

interface WebFetchProcessArgs {
  url: string
  cleanMode?: CleanMode
  chat_uuid?: string
}

interface WebFetchContext {
  artifactService: WorkspaceWebFetchArtifactService
  materializer: WebFetchContentMaterializer
  inlineMaxCharacters: number
}

interface PageSnapshot {
  currentUrl: string
  title: string
  bodyPreview: string
  bodyTextLength: number
}

type GooglePageKind = 'result' | 'anti_bot' | 'consent' | 'unknown'
type BingPageKind = 'result' | 'degraded' | 'unknown'

type SearchQualityAssessment = {
  accepted: boolean
  error?: string
  reason?: 'bing_degraded_page' | 'unexpected_page' | 'no_results' | 'low_relevance'
  matchedResultCount: number
  querySignalCount: number
}

const BING_SEARCH_DEGRADED_ERROR = 'BING_SEARCH_DEGRADED_PAGE'
const SEARCH_UNEXPECTED_PAGE_ERROR = 'SEARCH_UNEXPECTED_PAGE'
const SEARCH_NO_RESULTS_ERROR = 'SEARCH_NO_RESULTS'
const SEARCH_RESULTS_LOW_RELEVANCE_ERROR = 'SEARCH_RESULTS_LOW_RELEVANCE'

const searchQueryStopWords = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'do', 'does', 'for',
  'from', 'how', 'in', 'is', 'it', 'least', 'local', 'latest', 'must', 'need',
  'needs', 'news', 'of', 'on', 'online', 'or', 'official', 'officially',
  'search', 'should', 'that', 'the', 'time', 'to', 'today', 'was', 'what',
  'when', 'where', 'which', 'who', 'with'
])

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
  '.log',
  '.pdf',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico',
  '.zip', '.gz', '.tar', '.bin', '.docx', '.xlsx', '.pptx',
  '.mp3', '.mp4', '.wav', '.webm'
])

// Page loading, asynchronous content readiness and DOM extraction have separate bounds.
const LOAD_URL_TIMEOUT = 15000
const CONTENT_READY_TIMEOUT = 8000
const EXTRACT_TIMEOUT = 8000
// Overall deadlines include window queueing and file downloads.
const WEB_FETCH_TIMEOUT = 45000

// resolveConfiguredFetchCounts 的硬上限，防止配置项被误设为过大值时打出海量并发
const MAX_FETCH_COUNTS = 20

const logger = createLogger('WebToolsProcessor')

function createWebFetchContext(
  chatUuid: string | undefined,
  inlineMaxCharacters: number
): WebFetchContext {
  const artifactService = new WorkspaceWebFetchArtifactService(chatUuid)
  return {
    artifactService,
    materializer: new WebFetchContentMaterializer(artifactService),
    inlineMaxCharacters
  }
}

async function fetchPageContentViaHttp(
  url: string,
  mode: CleanMode,
  context: WebFetchContext,
  signal?: AbortSignal
): Promise<MaterializedWebContent> {
  const spool = await context.artifactService.allocateSpool()
  try {
    const response = await downloadViaHttp(url, userAgent, spool, signal)
    return await context.materializer.materialize(response, mode, context.inlineMaxCharacters, signal)
  } catch (error) {
    await context.artifactService.cleanupSpool(spool)
    throw error
  }
}

function isDirectDownloadUrl(url: string): boolean {
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

/**
 * 带超时的任务执行器：接收 task factory（而非已启动的 Promise），超时时通过
 * AbortController 通知 factory 内部取消在途操作（如 stop 加载、abort fetch），
 * 而不仅仅是让外层 race 提前 reject——避免任务在超时后仍在后台空耗资源。
 */
function withTimeout<T>(
  taskFactory: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
  parentSignal?: AbortSignal
): Promise<T> {
  if (parentSignal?.aborted) return Promise.reject(parentSignal.reason)
  const controller = new AbortController()
  let timer: NodeJS.Timeout | undefined
  let onAbort: (() => void) | undefined
  const interrupted = new Promise<T>((_, reject) => {
    onAbort = (): void => {
      const error = parentSignal?.reason ?? new Error('Operation aborted')
      reject(error)
      controller.abort(error)
    }
    parentSignal?.addEventListener('abort', onAbort, { once: true })
    timer = setTimeout(() => {
      const error = new Error(timeoutMessage)
      reject(error)
      controller.abort(error)
    }, timeoutMs)
  })
  return Promise.race([
    Promise.resolve().then(() => {
      controller.signal.throwIfAborted()
      return taskFactory(controller.signal)
    }),
    interrupted
  ]).finally(() => {
    if (timer) clearTimeout(timer)
    if (onAbort) parentSignal?.removeEventListener('abort', onAbort)
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isExpectedSearchResultUrl(engine: SearchEngineId, currentUrl: string): boolean {
  try {
    const parsed = new URL(currentUrl)
    const hostname = parsed.hostname.replace(/^www\./, '')
    if (engine === 'google') {
      return hostname.endsWith('google.com') && parsed.pathname === '/search'
    }
    if (engine === 'duckduckgo') {
      return hostname.endsWith('duckduckgo.com') && parsed.pathname === '/'
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
        bodyPreview: (document.body?.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 300),
        bodyTextLength: (document.body?.innerText || '').trim().length
      })
    `)

    return {
      currentUrl: typeof snapshot?.currentUrl === 'string' ? snapshot.currentUrl : '',
      title: typeof snapshot?.title === 'string' ? snapshot.title : '',
      bodyPreview: typeof snapshot?.bodyPreview === 'string' ? snapshot.bodyPreview : '',
      bodyTextLength: typeof snapshot?.bodyTextLength === 'number' ? snapshot.bodyTextLength : 0
    }
  } catch {
    return {
      currentUrl: window.webContents.getURL() || '',
      title: '',
      bodyPreview: '',
      bodyTextLength: 0
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

const bingDegradedSignals = [
  'unusual traffic',
  'verify you are human',
  'not a robot',
  'captcha',
  'access denied',
  'robot check',
  '检测到异常流量',
  '验证您是否是真人',
  '验证您不是机器人',
  '不是机器人'
]

const bingShellLabels = [
  'skip to content',
  'accessibility feedback',
  'feedback',
  'all',
  'images',
  'videos',
  'maps',
  'news',
  'more',
  'privacy',
  'terms',
  '跳至内容',
  '辅助功能反馈',
  '反馈',
  '全部',
  '搜索',
  '图片',
  '视频',
  '地图',
  '资讯',
  '更多',
  '隐私',
  '条款'
]

function classifyBingSearchPage(snapshot: PageSnapshot): BingPageKind {
  if (snapshot.currentUrl && !isExpectedSearchResultUrl('bing', snapshot.currentUrl)) {
    return 'unknown'
  }

  const body = snapshot.bodyPreview.toLowerCase().replace(/\s+/g, ' ').trim()
  const bodyTextLength = snapshot.bodyTextLength || body.length
  if (
    bodyTextLength <= 800
    && bingDegradedSignals.some(signal => body.includes(signal))
  ) return 'degraded'

  let residual = body
  for (const label of bingShellLabels) {
    residual = residual.split(label).join(' ')
  }
  residual = residual.replace(/[^\p{L}\p{N}]+/gu, '')

  if (bodyTextLength > 0 && bodyTextLength <= 160 && residual.length <= 12) {
    return 'degraded'
  }

  return 'result'
}

function escapeSearchPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractSearchQuerySignals(query: string): string[] {
  const segments = query.toLowerCase().match(/[a-z0-9]+|[\u3400-\u9fff]+/g) ?? []
  const signals: string[] = []

  for (const segment of segments) {
    if (/^[a-z0-9]/.test(segment)) {
      if (segment.length >= 2 && !searchQueryStopWords.has(segment)) {
        signals.push(segment)
      }
      continue
    }

    const characters = Array.from(segment)
    if (characters.length <= 2) {
      signals.push(segment)
      continue
    }
    for (let index = 0; index < characters.length - 1; index++) {
      signals.push(characters.slice(index, index + 2).join(''))
    }
  }

  return [...new Set(signals)]
}

function searchTextContainsSignal(text: string, signal: string): boolean {
  if (/^[a-z0-9]/.test(signal)) {
    return new RegExp(
      `(?:^|[^a-z0-9])${escapeSearchPattern(signal)}(?:$|[^a-z0-9])`,
      'i'
    ).test(text)
  }
  return text.includes(signal)
}

function assessSearchResultQuality(
  engine: SearchEngineId,
  query: string,
  pageSnapshot: PageSnapshot,
  searchItems: SearchResultItem[]
): SearchQualityAssessment {
  const pageKind = engine === 'bing' ? classifyBingSearchPage(pageSnapshot) : 'result'
  if (pageKind === 'degraded') {
    return {
      accepted: false,
      error: BING_SEARCH_DEGRADED_ERROR,
      reason: 'bing_degraded_page',
      matchedResultCount: 0,
      querySignalCount: 0
    }
  }
  if (pageKind === 'unknown') {
    return {
      accepted: false,
      error: SEARCH_UNEXPECTED_PAGE_ERROR,
      reason: 'unexpected_page',
      matchedResultCount: 0,
      querySignalCount: 0
    }
  }
  if (searchItems.length === 0) {
    return {
      accepted: false,
      error: SEARCH_NO_RESULTS_ERROR,
      reason: 'no_results',
      matchedResultCount: 0,
      querySignalCount: 0
    }
  }

  const querySignals = extractSearchQuerySignals(query)
  if (querySignals.length === 0) {
    return {
      accepted: true,
      matchedResultCount: searchItems.length,
      querySignalCount: 0
    }
  }

  const matchedResultCount = searchItems.filter(item => {
    let hostname = ''
    try {
      hostname = new URL(item.link).hostname
    } catch {
      // Keep title/snippet matching when a result link is malformed.
    }
    const text = `${item.title || ''}\n${item.snippet || ''}\n${hostname}`.toLowerCase()
    return querySignals.some(signal => searchTextContainsSignal(text, signal))
  }).length

  if (matchedResultCount === 0) {
    return {
      accepted: false,
      error: SEARCH_RESULTS_LOW_RELEVANCE_ERROR,
      reason: 'low_relevance',
      matchedResultCount,
      querySignalCount: querySignals.length
    }
  }

  return {
    accepted: true,
    matchedResultCount,
    querySignalCount: querySignals.length
  }
}

async function waitForManualGoogleVerification(
  window: BrowserWindow,
  signal?: AbortSignal
): Promise<PageSnapshot> {
  logger.warn('search_verification.manual_required')
  window.show()
  window.focus()

  try {
    await waitForCondition(async () => {
      const snapshot = await capturePageSnapshot(window)
      const kind = classifyGoogleSearchPage(snapshot)
      return kind === 'result'
    }, 120000, 1000, signal)

    const snapshot = await withTimeout(
      () => capturePageSnapshot(window), EXTRACT_TIMEOUT, 'Timeout capturing verified page', signal
    )
    logger.info('search_verification.completed', {
      currentUrl: snapshot.currentUrl,
      title: snapshot.title,
      bodyPreview: snapshot.bodyPreview
    })

    return snapshot
  } finally {
    // 无论验证成功、超时还是异常，都要隐藏窗口，否则可见窗口被 recycle 回池后
    // 续搜索复用会闪现（窗口本是 show:false 创建）。
    if (!window.isDestroyed()) {
      window.hide()
    }
  }
}

async function loadSearchPage(
  window: BrowserWindow,
  searchUrl: string,
  engine: SearchEngineId
): Promise<PageSnapshot> {
  try {
    await window.loadURL(searchUrl, { userAgent })
    return await capturePageSnapshot(window)
  } catch (caught: unknown) {
    const error = caught as { code?: string, message?: string } | undefined
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
    return Math.min(fetchCounts, MAX_FETCH_COUNTS)
  }

  try {
    const configured = configDb.getConfig()?.tools?.maxWebSearchItems
    if (typeof configured === 'number' && configured > 0) {
      return Math.min(configured, MAX_FETCH_COUNTS)
    }
  } catch (error) {
    logger.warn('web_search.read_max_items_config_failed', error)
  }

  return 3
}

/**
 * Load webpages in Electron, wait for content, then extract the rendered DOM.
 */
async function fetchPageContentViaRender(
  url: string,
  contentWindow: BrowserWindow,
  mode: CleanMode,
  context: WebFetchContext,
  signal?: AbortSignal
): Promise<MaterializedWebContent> {
  signal?.throwIfAborted()
  // 外层 signal（如 item-level 超时）触发时停止渲染窗口加载，让 loadURL / 抽取
  // 尽快 reject，finally 中的 permit 归还也随之提前。
  const onAbort = (): void => {
    if (contentWindow && !contentWindow.isDestroyed()) {
      contentWindow.webContents.stop()
      contentWindow.destroy()
    }
  }
  if (signal) {
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort)
  }

  try {
    // A file endpoint without an extension can turn navigation into a download.
    // Cancel Chromium's unmanaged download and use the bounded workspace downloader.
    let downloadUrl: string | undefined
    let resolveDownload!: () => void
    const download = new Promise<void>(resolve => { resolveDownload = resolve })
    const onDownload = (event: Event, item: DownloadItem, webContents: WebContents): void => {
      if (webContents !== contentWindow.webContents) return
      event.preventDefault()
      downloadUrl = item.getURL()
      resolveDownload()
    }
    const session = contentWindow.webContents.session
    session.on('will-download', onDownload)
    try {
      await withTimeout(
        (timeoutSignal) => {
          timeoutSignal.addEventListener('abort', () => {
            if (!contentWindow.isDestroyed()) contentWindow.destroy()
          }, { once: true })
          return Promise.race([
            contentWindow.loadURL(url, { userAgent }).catch(async error => {
              if (downloadUrl) return
              // Chromium can reject navigation before emitting will-download.
              if (error?.code !== 'ERR_ABORTED' && error?.code !== 'ERR_FAILED') throw error
              await withTimeout(() => download, 1000, error.message, signal)
            }),
            download
          ])
        },
        LOAD_URL_TIMEOUT,
        `Timeout loading page: ${url}`,
        signal
      )
    } finally {
      session.removeListener('will-download', onDownload)
    }
    signal?.throwIfAborted()
    if (downloadUrl) return await fetchPageContentViaHttp(downloadUrl, mode, context, signal)

    try {
      await waitForPageContent(contentWindow.webContents, CONTENT_READY_TIMEOUT, signal)
    } catch (error) {
      signal?.throwIfAborted()
      logger.warn('web_fetch.content_ready_timeout', { url, message: String(error) })
      // A continuously updating page can still have useful content at the deadline.
      // Extraction below has its own bound and retires a hung renderer.
    }

    // 只提取必要的原始数据：HTML、URL、标题，交由 Cheerio 在 Node.js 端处理。
    // 用 withTimeout 给 executeJavaScript 加界：页面 JS 卡死时 executeJavaScript
    // 会永久 pending（webContents.stop() 停网络加载但停不了卡死的 JS 事件循环），
    // 若不加界，本函数永不 settle → 上层 finally 的 releaseContentWindow 永不执行
    // → contentSem permit 泄漏 → 数个卡死页面后整个渲染路径永久阻塞。withTimeout
    // 超时时销毁窗口，避免卡住的 JS 被带入下一次借用；finally 仍归还 permit。
    const pageData: { html: string, finalUrl: string, title: string, contentSnapshot: string } = await withTimeout(
      (timeoutSignal) => {
        timeoutSignal.addEventListener('abort', () => {
          if (contentWindow && !contentWindow.isDestroyed()) {
            contentWindow.webContents.stop()
            contentWindow.destroy()
          }
        })
        return contentWindow.webContents.executeJavaScript(`
          ({
            html: document.body ? document.body.outerHTML : '',
            finalUrl: window.location.href,
            title: document.title || '',
            contentSnapshot: ${PAGE_CONTENT_SNAPSHOT_SCRIPT}
          })
        `)
      },
      EXTRACT_TIMEOUT,
      `Timeout extracting page: ${url}`,
      signal
    )
    const { title, text } = extractCleanContent(pageData.html, mode, pageData.title)
    assertUsableWebContent(text, pageData.title || title, pageData.finalUrl)
    if (!pageData.contentSnapshot) throw new Error('WEB_FETCH_CONTENT_NOT_READY')
    return await context.materializer.materializeExtractedText({
      pageTitle: pageData.title || title,
      finalUrl: pageData.finalUrl,
      extractedText: text,
      inlineMaxCharacters: context.inlineMaxCharacters,
      signal
    })
  } finally {
    if (signal) signal.removeEventListener('abort', onAbort)
  }
}

/** Webpages render in Electron; recognized file URLs download directly. */
async function fetchPageContent(
  url: string,
  mode: CleanMode,
  context: WebFetchContext,
  signal?: AbortSignal
): Promise<MaterializedWebContent> {
  signal?.throwIfAborted()
  if (isDirectDownloadUrl(url)) {
    return await fetchPageContentViaHttp(url, mode, context, signal)
  }

  const windowPool = getWindowPool()
  let contentWindow: BrowserWindow | null = null
  try {
    contentWindow = await windowPool.acquireContentWindow(signal)
    signal?.throwIfAborted()
    return await fetchPageContentViaRender(url, contentWindow, mode, context, signal)
  } finally {
    // 无条件归还（即便窗口已崩溃/销毁），否则信号量 permit 泄漏、容量永久减少。
    // recycleWindow 会处理已销毁窗口并始终释放 permit。abort 只是让这里更快执行到。
    if (contentWindow) {
      await windowPool.releaseContentWindow(contentWindow)
    }
  }
}

/**
 * Web Search - 执行网页搜索
 */
const executeWebSearch = async ({
  engine,
  fetchCounts,
  param,
  query,
  interactive,
  _fallbackDepth
}: WebSearchProcessArgs, signal: AbortSignal): Promise<WebSearchResponse> => {
  const searchStartTime = Date.now()
  const windowPool = getWindowPool()
  let searchWindow: BrowserWindow | null = null
  const onAbort = (): void => {
    if (searchWindow && !searchWindow.isDestroyed()) {
      searchWindow.webContents.stop()
      searchWindow.destroy()
    }
  }
  signal.addEventListener('abort', onAbort, { once: true })

  try {
    signal.throwIfAborted()
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
      interactive: Boolean(interactive),
      timestamp: new Date().toISOString()
    })

    // Acquire a search window from the pool
    const windowCreateStart = Date.now()
    searchWindow = await windowPool.acquireSearchWindow(signal)
    signal.throwIfAborted()
    const windowCreateTime = Date.now() - windowCreateStart
    logger.info('web_search.search_window_acquired', {
      engine: searchEngine.displayName,
      durationMs: windowCreateTime
    })

    const searchUrl = searchEngine.buildSearchUrl(trimmedQuery)

    // Load search page
    const pageLoadStart = Date.now()
    const pageSnapshot = await withTimeout(
      loadSignal => {
        loadSignal.addEventListener('abort', onAbort, { once: true })
        return loadSearchPage(searchWindow!, searchUrl, searchEngine.id)
      },
      LOAD_URL_TIMEOUT + EXTRACT_TIMEOUT,
      'Timeout loading search page',
      signal
    )
    const pageLoadTime = Date.now() - pageLoadStart
    logger.info('web_search.page_loaded', {
      engine: searchEngine.displayName,
      durationMs: pageLoadTime
    })
    logger.info('web_search.page_snapshot', {
      engine: searchEngine.displayName,
      currentUrl: pageSnapshot.currentUrl,
      title: pageSnapshot.title,
      bodyPreview: pageSnapshot.bodyPreview,
      bodyTextLength: pageSnapshot.bodyTextLength
    })

    if (searchEngine.id === 'bing') {
      const pageKind = classifyBingSearchPage(pageSnapshot)
      logger.info('web_search.bing_page_classified', {
        engine: searchEngine.displayName,
        kind: pageKind,
        currentUrl: pageSnapshot.currentUrl,
        bodyTextLength: pageSnapshot.bodyTextLength
      })
      if (pageKind === 'degraded') {
        logger.warn('web_search.quality_gate_rejected', {
          engine: searchEngine.displayName,
          query: resolvedQuery,
          reason: 'bing_degraded_page',
          currentUrl: pageSnapshot.currentUrl,
          bodyTextLength: pageSnapshot.bodyTextLength
        })
        return {
          success: false,
          results: [],
          error: BING_SEARCH_DEGRADED_ERROR
        }
      }
    }

    if (searchEngine.id === 'google') {
      const pageKind = classifyGoogleSearchPage(pageSnapshot)
      logger.info('web_search.google_page_classified', {
        engine: searchEngine.displayName,
        kind: pageKind,
        currentUrl: pageSnapshot.currentUrl
      })

      if (pageKind === 'anti_bot' || pageKind === 'consent') {
        const canPrompt =
          Boolean(interactive) && !!mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()

        if (canPrompt) {
          const verifiedSnapshot = await withTimeout(
            verificationSignal => waitForManualGoogleVerification(searchWindow!, verificationSignal),
            120000,
            'Timeout verifying search page',
            signal
          )
          logger.info('web_search.page_snapshot_after_verification', {
            engine: searchEngine.displayName,
            currentUrl: verifiedSnapshot.currentUrl,
            title: verifiedSnapshot.title,
            bodyPreview: verifiedSnapshot.bodyPreview
          })
        } else if ((_fallbackDepth ?? 0) < 1) {
          // 非交互场景：不弹窗死等，降级到 Bing 重跑一次
          logger.warn('web_search.anti_bot_non_interactive_fallback_bing', {
            engine: searchEngine.displayName,
            kind: pageKind,
            currentUrl: pageSnapshot.currentUrl
          })
          await windowPool.releaseSearchWindow(searchWindow)
          searchWindow = null
          return await executeWebSearch({
            engine: 'bing',
            fetchCounts,
            param: trimmedQuery,
            query,
            interactive,
            _fallbackDepth: (_fallbackDepth ?? 0) + 1
          }, signal)
        } else {
          logger.warn('web_search.anti_bot_no_fallback', {
            engine: searchEngine.displayName,
            kind: pageKind
          })
          return {
            success: false,
            results: [],
            error: 'Search blocked by anti-bot verification'
          }
        }
      }
    }

    // Wait for results to be present
    const waitStart = Date.now()
    await waitForCondition(async () => {
      if (!searchWindow) return false
      return await searchWindow.webContents.executeJavaScript(searchEngine.waitForResultsScript)
    }, 15000, 500, signal)
    const waitTime = Date.now() - waitStart
    logger.info('web_search.results_ready', {
      engine: searchEngine.displayName,
      durationMs: waitTime
    })

    // Extract links, titles, and snippets from search results
    const extractStart = Date.now()
    let searchItems: SearchResultItem[] = await withTimeout(
      extractSignal => {
        extractSignal.addEventListener('abort', onAbort, { once: true })
        return searchWindow!.webContents.executeJavaScript(
          searchEngine.buildExtractResultsScript(Math.min(resolvedFetchCounts * 2, MAX_FETCH_COUNTS))
        )
      },
      EXTRACT_TIMEOUT,
      'Timeout extracting search results',
      signal
    )
    if (searchEngine.id === 'google') searchItems = await resolveGoogleResultUrls(searchItems, signal)
    const extractTime = Date.now() - extractStart
    logger.info('web_search.results_extracted', {
      engine: searchEngine.displayName,
      count: searchItems.length,
      durationMs: extractTime
    })

    searchItems = selectSearchResults(searchItems, resolvedQuery, resolvedFetchCounts)

    const quality = assessSearchResultQuality(
      searchEngine.id,
      resolvedQuery,
      pageSnapshot,
      searchItems
    )
    logger.info('web_search.results_quality_checked', {
      engine: searchEngine.displayName,
      query: resolvedQuery,
      accepted: quality.accepted,
      reason: quality.reason,
      itemCount: searchItems.length,
      matchedResultCount: quality.matchedResultCount,
      querySignalCount: quality.querySignalCount
    })
    if (!quality.accepted) {
      logger.warn('web_search.quality_gate_rejected', {
        engine: searchEngine.displayName,
        query: resolvedQuery,
        reason: quality.reason,
        error: quality.error,
        itemCount: searchItems.length,
        matchedResultCount: quality.matchedResultCount,
        querySignalCount: quality.querySignalCount,
        currentUrl: pageSnapshot.currentUrl,
        bodyTextLength: pageSnapshot.bodyTextLength
      })
      return {
        success: false,
        results: [],
        error: quality.error
      }
    }

    signal.throwIfAborted()
    logger.info('web_search.completed', {
      engine: searchEngine.displayName,
      count: searchItems.length,
      durationMs: Date.now() - searchStartTime
    })

    return {
      success: true,
      results: searchItems.map((item): WebSearchResultV2 => ({
        query: resolvedQuery,
        success: true,
        link: item.link,
        title: item.title,
        snippet: item.snippet
      }))
    }

  } catch (caught: unknown) {
    const error = caught as { code?: string, message?: string } | undefined
    logger.error('web_search.failed', error)
    return {
      success: false,
      results: [],
      error: error?.message || 'Search operation failed'
    }
  } finally {
    signal.removeEventListener('abort', onAbort)
    if (searchWindow) {
      await windowPool.releaseSearchWindow(searchWindow)
    }
  }
}

const processWebSearch = async (
  args: WebSearchProcessArgs,
  context?: EmbeddedToolExecutionContext
): Promise<WebSearchResponse> => {
  try {
    return await withTimeout(
      signal => executeWebSearch(args, signal),
      args.interactive ? 180000 : 60000,
      'Timeout searching web',
      context?.signal
    )
  } catch (error) {
    return { success: false, results: [], error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Web Fetch - 获取指定 URL 的页面内容
 */
const processWebFetch = async (
  { url, cleanMode, chat_uuid }: WebFetchProcessArgs,
  context?: EmbeddedToolExecutionContext
): Promise<WebFetchResponse> => {
  const fetchStartTime = Date.now()

  try {
    const mode: CleanMode = cleanMode === 'full' ? 'full' : 'lite'
    logger.info('web_fetch.started', {
      url,
      cleanMode: mode,
      timestamp: new Date().toISOString()
    })
    const fetchContext = createWebFetchContext(chat_uuid, WEB_FETCH_INLINE_MAX_CHARACTERS)

    // Bound queueing, rendering and direct downloads with the same cancellation signal.
    const { pageTitle, finalUrl, extractedText, artifact } = await withTimeout(
      (signal) => fetchPageContent(url, mode, fetchContext, signal),
      WEB_FETCH_TIMEOUT,
      `Timeout fetching page: ${url}`,
      context?.signal
    )

    const totalTime = Date.now() - fetchStartTime
    logger.info('web_fetch.completed', {
      url: finalUrl,
      durationMs: totalTime
    })

    return {
      success: true,
      url: finalUrl,
      title: pageTitle,
      content: extractedText,
      artifact
    }
  } catch (caught: unknown) {
    const error = caught as { code?: string, message?: string } | undefined
    logger.error('web_fetch.failed', error)
    return {
      success: false,
      url: url,
      title: '',
      content: '',
      error: error?.message || 'Failed to fetch page'
    }
  }
}

export {
  processWebSearch,
  processWebFetch,
  // 以下仅用于单测（内部实现细节，外部不应依赖）
  withTimeout as _withTimeout,
  WEB_FETCH_TIMEOUT as _WEB_FETCH_TIMEOUT,
  resolveConfiguredFetchCounts as _resolveConfiguredFetchCounts,
  MAX_FETCH_COUNTS as _MAX_FETCH_COUNTS,
  classifyBingSearchPage as _classifyBingSearchPage,
  classifyGoogleSearchPage as _classifyGoogleSearchPage,
  assessSearchResultQuality as _assessSearchResultQuality
}

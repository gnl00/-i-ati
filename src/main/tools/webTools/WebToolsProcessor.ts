import type { BrowserWindow } from 'electron'
import { mainWindow } from '@main/main-window'
import type { WebSearchResponse, WebSearchResultV2, WebFetchResponse } from '@tools/webTools/index.d'
import { getWindowPool } from './BrowserWindowPool'
import { configDb } from '@main/db/config'
import { createLogger } from '@main/logging/LogService'
import { resolveSearchEngine, type SearchResultItem } from './search-engine'
import { waitForCondition } from './util/waitForCondition'
import { Semaphore } from './util/Semaphore'
import { extractCleanContent } from './extract/ContentExtractor'
import type { CleanMode } from './extract/postClean'
import { downloadViaHttp } from './http/HttpFetcher'
import {
  WEB_FETCH_INLINE_MAX_CHARACTERS,
  WEB_SEARCH_ARTIFACT_MAX_BYTES,
  WEB_SEARCH_RESULT_INLINE_MAX_CHARACTERS,
  WEB_SEARCH_TOTAL_INLINE_MAX_CHARACTERS
} from './artifacts/constants'
import { WorkspaceWebFetchArtifactService } from './artifacts/WorkspaceWebFetchArtifactService'
import {
  WebFetchContentMaterializer,
  type ArtifactBudgetReservation,
  type MaterializedWebContent
} from './artifacts/WebFetchContentMaterializer'

interface WebSearchProcessArgs {
  engine?: 'bing' | 'google'
  fetchCounts?: number
  param?: string
  query?: string
  snippetsOnly?: boolean
  // 是否允许弹窗人工验证（Google 反爬/consent）。默认 false：后台/LLM 调用不弹窗死等，
  // 降级到 Bing。仅 renderer 用户主动搜索时透传 true。
  interactive?: boolean
  // 内部递归防护：反爬降级到 Bing 的重试深度，避免无限递归
  _fallbackDepth?: number
  chat_uuid?: string
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

export class SearchArtifactBudget {
  private bytes = 0
  private readonly completed = new Set<number>()
  private waiters: Array<() => void> = []

  async reserve(
    index: number,
    sizeBytes: number,
    signal?: AbortSignal
  ): Promise<ArtifactBudgetReservation | undefined> {
    while (!this.previousResultsCompleted(index)) {
      await new Promise<void>((resolve, reject) => {
        const wake = (): void => {
          signal?.removeEventListener('abort', onAbort)
          resolve()
        }
        const onAbort = (): void => {
          this.waiters = this.waiters.filter(waiter => waiter !== wake)
          reject(new Error('Fetch aborted while waiting for artifact budget'))
        }
        if (signal?.aborted) {
          reject(new Error('Fetch aborted while waiting for artifact budget'))
          return
        }
        signal?.addEventListener('abort', onAbort, { once: true })
        this.waiters.push(wake)
      })
    }
    if (
      this.bytes + sizeBytes > WEB_SEARCH_ARTIFACT_MAX_BYTES
    ) return undefined
    this.bytes += sizeBytes
    let active = true
    return {
      commit: (): void => {
        active = false
      },
      release: (): void => {
        if (!active) return
        active = false
        this.bytes -= sizeBytes
      }
    }
  }

  complete(index: number): void {
    this.completed.add(index)
    const waiters = this.waiters
    this.waiters = []
    waiters.forEach(resolve => resolve())
  }

  private previousResultsCompleted(index: number): boolean {
    for (let previous = 0; previous < index; previous++) {
      if (!this.completed.has(previous)) return false
    }
    return true
  }
}

export async function applySearchAggregateInlineBudget(
  results: WebSearchResultV2[],
  promote: (result: WebSearchResultV2, index: number) => Promise<MaterializedWebContent>
): Promise<void> {
  let remainingInlineCharacters = WEB_SEARCH_TOTAL_INLINE_MAX_CHARACTERS
  for (let resultIndex = 0; resultIndex < results.length; resultIndex++) {
    const result = results[resultIndex]
    if (!result.success || result.artifact) continue
    if (result.content.length <= remainingInlineCharacters) {
      remainingInlineCharacters -= result.content.length
      continue
    }
    try {
      const promoted = await promote(result, resultIndex)
      result.content = promoted.extractedText
      result.artifact = promoted.artifact
    } catch (error: unknown) {
      const errorValue = error as { code?: string, message?: string } | undefined
      result.success = false
      result.content = ''
      result.error = errorValue?.code
        || errorValue?.message
        || 'WEB_SEARCH_ARTIFACT_BUDGET_EXCEEDED'
    }
  }
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
  '.log',
  '.pdf'
])

// 直连 HTTP 抓取的软超时（渐进增强首选路径）
const DIRECT_HTTP_TIMEOUT = 12000
// 渲染路径 loadURL 的软超时（重 SPA 页首屏加载预算）
const LOAD_URL_TIMEOUT = 15000
// 渲染路径 SPA 内容就绪等待（body.innerText 达到有效长度）
const CONTENT_READY_TIMEOUT = 8000
// 渲染路径抽取 executeJavaScript 的软超时
const EXTRACT_TIMEOUT = 8000

// web_fetch 整体安全网 deadline：产品级整体上限——超过此时长即视为卡死并返回 error
// （这是 LLM 工具调用，不宜等更久）。派生自渲染路径 happy-path 各串行子阶段之和
// （direct + loadURL + content-ready + extract），作为该上限的 best-effort 覆盖目标。
// 注意：loadURL / extraction 失败时的 direct HTTP fallback 未计入此和，
// 仅受本 deadline 的外层 signal 约束，可能被截断；统一 spool 下载与 materializer
// 都会观察 abort 并清理临时文件。派生而非写死，避免子超时调整后漂移。（当前值 = 45000）
const WEB_FETCH_TIMEOUT =
  DIRECT_HTTP_TIMEOUT + LOAD_URL_TIMEOUT + CONTENT_READY_TIMEOUT + EXTRACT_TIMEOUT + 2000

// 搜索单条抓取超时：有意紧于 web_fetch —— 搜索重广度，慢 SPA 单条不该拖慢整批
// （item 并发受 scrapeSem 限流，Promise.all 等最慢一条），且超时后该条 snippet 仍返回。
// 放宽到能容纳「直连失败 + loadURL + 一次 content-ready」，但不给足完整抽取预算。
// （当前值 = 37000）
const SCRAPE_ITEM_TIMEOUT = DIRECT_HTTP_TIMEOUT + LOAD_URL_TIMEOUT + CONTENT_READY_TIMEOUT + 2000

// 直连结果正文低于此长度视为不足，回退渲染窗口
const MIN_DIRECT_CONTENT = 200

// 搜索结果批量抓取的并发上限（跨 direct/render 路径统一限流，防止一次搜索瞬间
// 打出过多并发请求）。窗口池自身还有 contentSem(3) 做第二层背压，二者严格嵌套
// （scrapeSem 在外层先 acquire，内层 contentSem 先 release），不会死锁。
const MAX_SCRAPE_CONCURRENCY = 6
const scrapeSem = new Semaphore(MAX_SCRAPE_CONCURRENCY)
// resolveConfiguredFetchCounts 的硬上限，防止配置项被误设为过大值时打出海量并发
const MAX_FETCH_COUNTS = 20

const logger = createLogger('WebToolsProcessor')

function createWebFetchContext(
  chatUuid: string | undefined,
  inlineMaxCharacters: number
): WebFetchContext {
  const artifactService = new WorkspaceWebFetchArtifactService(chatUuid)
  void artifactService.cleanupStalePartFiles().catch((error) => {
    logger.warn('web_fetch.partial.cleanup_failed', {
      message: error instanceof Error ? error.message : String(error)
    })
  })
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

/**
 * 带超时的任务执行器：接收 task factory（而非已启动的 Promise），超时时通过
 * AbortController 通知 factory 内部取消在途操作（如 stop 加载、abort fetch），
 * 而不仅仅是让外层 race 提前 reject——避免任务在超时后仍在后台空耗资源。
 */
function withTimeout<T>(
  taskFactory: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  const controller = new AbortController()
  let timer: NodeJS.Timeout | null = null

  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new Error(timeoutMessage))
    }, timeoutMs)
  })

  return Promise.race([taskFactory(controller.signal), timeoutPromise]).finally(() => {
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

  try {
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
 * 渲染路径：用 BrowserWindow 加载页面（等 SPA 渲染），再抽取正文。
 * loadURL / 抽取失败时降级到直连 HTTP。
 */
async function fetchPageContentViaRender(
  url: string,
  contentWindow: BrowserWindow,
  mode: CleanMode,
  context: WebFetchContext,
  signal?: AbortSignal
): Promise<MaterializedWebContent> {
  // 外层 signal（如 item-level 超时）触发时停止渲染窗口加载，让 loadURL / 抽取
  // 尽快 reject，finally 中的 permit 归还也随之提前。
  const onAbort = (): void => {
    if (contentWindow && !contentWindow.isDestroyed()) {
      contentWindow.webContents.stop()
    }
  }
  if (signal) {
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort)
  }

  try {
    try {
      await withTimeout(
        (timeoutSignal) => {
          timeoutSignal.addEventListener('abort', () => {
            if (contentWindow && !contentWindow.isDestroyed()) {
              contentWindow.webContents.stop()
            }
          })
          return contentWindow.loadURL(url, { userAgent })
        },
        LOAD_URL_TIMEOUT,
        `Timeout loading page: ${url}`
      )
    } catch (error: any) {
      logger.warn('web_fetch.load_url_failed_fallback_http', {
        url,
        message: error?.message || String(error)
      })
      return await fetchPageContentViaHttp(url, mode, context, signal)
    }

    // SPA 内容等待：loadURL 在 DOM ready 时 resolve，但 SPA（如 Twitter/X）
    // 需要额外时间通过 JS 渲染内容。等待 body.innerText 达到有效长度后再提取。
    try {
      await waitForCondition(
        async () => {
          try {
            const textLength = await contentWindow.webContents.executeJavaScript(
              '(document.body?.innerText || "").replace(/\\s+/g, "").length'
            )
            return (textLength as number) > 20
          } catch {
            return false
          }
        },
        CONTENT_READY_TIMEOUT,
        300,
        signal
      )
    } catch {
      logger.warn('web_fetch.content_ready_timeout', { url })
    }

    // 若外层已 abort（如 item-level 22s 超时触发的取消），不要在已 stop 的页面上
    // 继续抽取并返回近空内容的「假成功」，直接抛出让上层归类为失败。
    // 注意只在真正 aborted 时抛；非 abort 的慢页面（8s 内没到 innerText 阈值但仍
    // 有可提取内容）保持原行为，继续尝试抽取。
    if (signal?.aborted) {
      throw new Error('Aborted during render')
    }

    let pageData: { html: string, finalUrl: string, title: string }
    try {
      // 只提取必要的原始数据：HTML、URL、标题，交由 Cheerio 在 Node.js 端处理。
      // 用 withTimeout 给 executeJavaScript 加界：页面 JS 卡死时 executeJavaScript
      // 会永久 pending（webContents.stop() 停网络加载但停不了卡死的 JS 事件循环），
      // 若不加界，本函数永不 settle → 上层 finally 的 releaseContentWindow 永不执行
      // → contentSem permit 泄漏 → 数个卡死页面后整个渲染路径永久阻塞。withTimeout
      // 的 race 让外层 await 在超时后及时返回（底层 executeJavaScript 仍在后台卡着，
      // 但已无碍：控制流走到下面的 catch/上层 finally，permit 得以归还）。
      pageData = await withTimeout(
        (timeoutSignal) => {
          timeoutSignal.addEventListener('abort', () => {
            if (contentWindow && !contentWindow.isDestroyed()) {
              contentWindow.webContents.stop()
            }
          })
          return contentWindow.webContents.executeJavaScript(`
            ({
              html: document.body ? document.body.outerHTML : '',
              finalUrl: window.location.href,
              title: document.title || ''
            })
          `)
        },
        EXTRACT_TIMEOUT,
        `Timeout extracting page: ${url}`
      )
    } catch (error: any) {
      const currentUrl = contentWindow.webContents.getURL() || url
      logger.warn('web_fetch.extract_js_failed_fallback_http', {
        url: currentUrl,
        message: error?.message || String(error)
      })
      return await fetchPageContentViaHttp(currentUrl, mode, context, signal)
    }

    const { title, text } = extractCleanContent(pageData.html, mode, pageData.title)
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

/**
 * 渐进增强抓取：优先直连 HTTP（快、不占窗口），正文不足或失败再回退渲染窗口。
 * content window 仅在真正需要渲染时才 acquire，静态页完全不进窗口池。
 */
async function fetchPageContentProgressive(
  url: string,
  mode: CleanMode,
  context: WebFetchContext,
  signal?: AbortSignal
): Promise<MaterializedWebContent> {
  // 已知纯静态/原始资源：直接直连
  if (shouldPreferDirectHttpFetch(url)) {
    return await fetchPageContentViaHttp(url, mode, context, signal)
  }

  // 先尝试直连，正文足够即返回，省掉起窗口与 SPA 等待
  try {
    const direct = await withTimeout(
      (timeoutSignal) => fetchPageContentViaHttp(url, mode, context, timeoutSignal),
      DIRECT_HTTP_TIMEOUT,
      `Timeout direct-fetching page: ${url}`
    )
    if (direct.artifact) {
      return direct
    }
    if (direct.extractedText.length >= MIN_DIRECT_CONTENT) {
      logger.debug('web_fetch.direct_http_sufficient', { url, length: direct.extractedText.length })
      return direct
    }
    logger.info('web_fetch.direct_http_insufficient_fallback_render', {
      url,
      length: direct.extractedText.length
    })
  } catch (error: any) {
    if (
      error?.code === 'WEB_FETCH_DOWNLOAD_TOO_LARGE'
      || error?.code === 'WEB_SEARCH_ARTIFACT_BUDGET_EXCEEDED'
      || signal?.aborted
    ) {
      throw error
    }
    logger.info('web_fetch.direct_http_failed_fallback_render', {
      url,
      message: error?.message || String(error)
    })
  }

  if (signal?.aborted) {
    throw new Error('Aborted before render')
  }

  // 回退渲染路径
  const windowPool = getWindowPool()
  let contentWindow: BrowserWindow | null = null
  try {
    contentWindow = await windowPool.acquireContentWindow()
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
const processWebSearch = async ({
  engine,
  fetchCounts,
  param,
  query,
  snippetsOnly,
  interactive,
  _fallbackDepth,
  chat_uuid
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
    const searchArtifactBudget = new SearchArtifactBudget()
    const fetchContext = createWebFetchContext(chat_uuid, WEB_SEARCH_RESULT_INLINE_MAX_CHARACTERS)

    logger.info('web_search.started', {
      engine: searchEngine.displayName,
      query: trimmedQuery,
      fetchCounts: resolvedFetchCounts,
      snippetsOnly: Boolean(snippetsOnly),
      interactive: Boolean(interactive),
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
        const canPrompt =
          Boolean(interactive) && !!mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()

        if (canPrompt) {
          const verifiedSnapshot = await waitForManualGoogleVerification(searchWindow)
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
          return await processWebSearch({
            engine: 'bing',
            fetchCounts,
            param: trimmedQuery,
            query,
            snippetsOnly,
            interactive,
            _fallbackDepth: (_fallbackDepth ?? 0) + 1,
            chat_uuid
          })
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
      await windowPool.releaseSearchWindow(searchWindow)
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

    // Process each search item: scrape full content and extract metadata.
    // 渐进增强：静态页走直连不占窗口，仅需渲染的才进窗口池（受信号量背压）。
    logger.info('web_search.scrape_started', {
      engine: searchEngine.displayName,
      count: searchItems.length
    })
    const scrapeStart = Date.now()
    const scrapedResults: WebSearchResultV2[] = await Promise.all(
      searchItems.map(async (item: SearchResultItem, index: number): Promise<WebSearchResultV2> => {
        const itemStart = Date.now()
        const itemContext: WebFetchContext = {
          ...fetchContext,
          materializer: new WebFetchContentMaterializer(
            fetchContext.artifactService,
            (sizeBytes, signal) => searchArtifactBudget.reserve(index, sizeBytes, signal)
          )
        }

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
          // 先过并发闸门（覆盖 direct + render 全程），try/finally 确保 timeout/throw
          // 都释放 permit，不泄漏。
          await scrapeSem.acquire()
          try {
            const { pageTitle, finalUrl, extractedText, artifact } = await withTimeout(
              (signal) => fetchPageContentProgressive(item.link, 'lite', itemContext, signal),
              SCRAPE_ITEM_TIMEOUT,
              `Timeout scraping page: ${item.link}`
            )

            resultItem.link = finalUrl
            resultItem.title = pageTitle || item.title
            resultItem.content = extractedText
            resultItem.artifact = artifact
            resultItem.success = true
          } finally {
            scrapeSem.release()
          }

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
          // 注意：success:false 仅表示未拿到完整正文 content；resultItem 上的 snippet/title/link
          // 来自上游搜索结果，此处仍原样保留（未被覆盖），消费者（LLM）可继续利用——这是
          // SCRAPE_ITEM_TIMEOUT「超时后 snippet 仍返回」的落点，而非「整条 item 无用」。
          resultItem.success = false
          resultItem.error = err?.message || 'Failed to fetch page'
          return resultItem
        } finally {
          searchArtifactBudget.complete(index)
        }
      })
    )

    await applySearchAggregateInlineBudget(scrapedResults, async (result, resultIndex) => {
      const orderedMaterializer = new WebFetchContentMaterializer(
        fetchContext.artifactService,
        (sizeBytes) => searchArtifactBudget.reserve(resultIndex, sizeBytes)
      )
      return orderedMaterializer.materializeExtractedText({
        pageTitle: result.title,
        finalUrl: result.link,
        extractedText: result.content,
        inlineMaxCharacters: 0
      })
    })

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
      error: error?.message || 'Search operation failed'
    }
  } finally {
    if (searchWindow) {
      await windowPool.releaseSearchWindow(searchWindow)
    }
  }
}

/**
 * Web Fetch - 获取指定 URL 的页面内容
 */
const processWebFetch = async ({ url, cleanMode, chat_uuid }: WebFetchProcessArgs): Promise<WebFetchResponse> => {
  const fetchStartTime = Date.now()

  try {
    const mode: CleanMode = cleanMode === 'full' ? 'full' : 'lite'
    logger.info('web_fetch.started', {
      url,
      cleanMode: mode,
      timestamp: new Date().toISOString()
    })
    const fetchContext = createWebFetchContext(chat_uuid, WEB_FETCH_INLINE_MAX_CHARACTERS)

    // 与 processWebSearch 一致：整体超时 + signal 贯穿，保证 HTTP 子路径（含直连静态/
    // 渲染回退）有界、渲染路径 content window permit 一定归还，避免慢速涓流响应永久挂死。
    const { pageTitle, finalUrl, extractedText, artifact } = await withTimeout(
      (signal) => fetchPageContentProgressive(url, mode, fetchContext, signal),
      WEB_FETCH_TIMEOUT,
      `Timeout fetching page: ${url}`
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
  } catch (error: any) {
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
  MAX_SCRAPE_CONCURRENCY as _MAX_SCRAPE_CONCURRENCY,
  MAX_FETCH_COUNTS as _MAX_FETCH_COUNTS
}

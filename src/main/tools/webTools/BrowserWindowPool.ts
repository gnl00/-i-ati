import { BrowserWindow } from 'electron'
import { mainWindow } from '@main/main-window'
import { createLogger } from '@main/logging/LogService'
import { Semaphore } from './util/Semaphore'

interface WindowPoolConfig {
  searchWindowCount: number
  contentWindowCount: number
  userAgent: string
}

interface PooledWindow {
  window: BrowserWindow
  inUse: boolean
  createdAt: number
  lastUsedAt: number
}

const logger = createLogger('BrowserWindowPool')

// about:blank 清理导航的最长等待，超时也放行以免 permit 卡死
const CLEAR_STATE_TIMEOUT = 2000

class BrowserWindowPool {
  private searchWindows: PooledWindow[] = []
  private contentWindows: PooledWindow[] = []
  private config: WindowPoolConfig
  private isInitialized = false
  // 固定容量信号量：容量 = 预建窗口数，acquire 先过闸再拿窗口，天然背压排队
  private readonly searchSem: Semaphore
  private readonly contentSem: Semaphore

  constructor(config: WindowPoolConfig) {
    this.config = config
    this.searchSem = new Semaphore(config.searchWindowCount)
    this.contentSem = new Semaphore(config.contentWindowCount)
  }

  /**
   * Initialize the window pool by creating all windows upfront
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.debug('initialize.skipped_already_initialized')
      return
    }

    const startTime = Date.now()
    logger.info('initialize.started', {
      searchWindowCount: this.config.searchWindowCount,
      contentWindowCount: this.config.contentWindowCount
    })

    // Create search windows
    for (let i = 0; i < this.config.searchWindowCount; i++) {
      const window = this.createSearchWindow()
      this.searchWindows.push({
        window,
        inUse: false,
        createdAt: Date.now(),
        lastUsedAt: Date.now()
      })
    }

    // Create content windows
    for (let i = 0; i < this.config.contentWindowCount; i++) {
      const window = this.createContentWindow()
      this.contentWindows.push({
        window,
        inUse: false,
        createdAt: Date.now(),
        lastUsedAt: Date.now()
      })
    }

    this.isInitialized = true
    const initTime = Date.now() - startTime
    logger.info('initialize.completed', {
      searchWindows: this.searchWindows.length,
      contentWindows: this.contentWindows.length,
      durationMs: initTime
    })
  }

  /**
   * Acquire a search window from the pool.
   * 先获取信号量 permit（容量 = 池大小，满则排队），再取空闲窗口。
   */
  async acquireSearchWindow(): Promise<BrowserWindow> {
    if (!this.isInitialized) {
      await this.initialize()
    }
    await this.searchSem.acquire()
    try {
      return this.checkoutWindow(this.searchWindows, () => this.createSearchWindow())
    } catch (err) {
      this.searchSem.release()
      throw err
    }
  }

  /**
   * Acquire a content window from the pool.
   */
  async acquireContentWindow(): Promise<BrowserWindow> {
    if (!this.isInitialized) {
      await this.initialize()
    }
    await this.contentSem.acquire()
    try {
      return this.checkoutWindow(this.contentWindows, () => this.createContentWindow())
    } catch (err) {
      this.contentSem.release()
      throw err
    }
  }

  /**
   * 从池中取一个空闲窗口标记为占用；若因崩溃留下空档则补建（不会超过容量，因为
   * 已先过信号量闸门）。
   */
  private checkoutWindow(pool: PooledWindow[], create: () => BrowserWindow): BrowserWindow {
    let pooled = pool.find(w => !w.inUse && !w.window.isDestroyed())
    if (!pooled) {
      const window = create()
      pooled = { window, inUse: false, createdAt: Date.now(), lastUsedAt: Date.now() }
      pool.push(pooled)
    }
    pooled.inUse = true
    pooled.lastUsedAt = Date.now()
    return pooled.window
  }

  /**
   * Release a search window back to the pool.
   */
  async releaseSearchWindow(window: BrowserWindow): Promise<void> {
    await this.recycleWindow(this.searchWindows, window, this.config.searchWindowCount)
    this.searchSem.release()
  }

  /**
   * Release a content window back to the pool.
   */
  async releaseContentWindow(window: BrowserWindow): Promise<void> {
    await this.recycleWindow(this.contentWindows, window, this.config.contentWindowCount)
    this.contentSem.release()
  }

  /**
   * 归还窗口：超容量或已销毁的直接 destroy 并移除，否则清理状态后复用。
   * permit 由调用方在此之后释放，确保清理完成前不会被下一个 acquire 抢走。
   */
  private async recycleWindow(
    pool: PooledWindow[],
    window: BrowserWindow,
    capacity: number
  ): Promise<void> {
    const index = pool.findIndex(w => w.window === window)
    if (index === -1) {
      // 窗口已被崩溃处理移除；permit 仍需释放（由调用方处理）
      return
    }

    if (window.isDestroyed() || pool.length > capacity) {
      pool.splice(index, 1)
      if (!window.isDestroyed()) window.destroy()
      return
    }

    const pooled = pool[index]
    // 关键：先 await 清理完成，再翻 inUse=false。清理期间保持 inUse=true，使该窗口
    // 对 checkoutWindow 的 find(w => !w.inUse) 不可见，避免并发 acquirer 选中一个
    // 仍在导航 about:blank 的窗口后 loadURL(realUrl) 竞态导致 ERR_ABORTED。
    await this.clearWindowState(window)
    pooled.inUse = false
    pooled.lastUsedAt = Date.now()
  }

  /**
   * Clear window state by navigating to about:blank (bounded by timeout).
   */
  private async clearWindowState(window: BrowserWindow): Promise<void> {
    if (window.isDestroyed()) return

    try {
      window.webContents.stop()
      // 等待 about:blank 加载完成再放行，避免与下一次 loadURL(realUrl) 竞态导致 ERR_ABORTED
      await Promise.race([
        window.loadURL('about:blank').catch(() => {}),
        new Promise<void>(resolve =>
          setTimeout(() => {
            // 超时放行前先中止未完成的 about:blank 导航，否则下次 loadURL(realUrl)
            // 仍会与飞行中的导航竞态（Bing 路径不恢复 ERR_ABORTED，会直接失败）。
            if (!window.isDestroyed()) window.webContents.stop()
            resolve()
          }, CLEAR_STATE_TIMEOUT)
        )
      ])
    } catch (err) {
      logger.error('clear_window_state.failed', err)
    }
  }

  /**
   * Create a search window with appropriate settings
   */
  private createSearchWindow(): BrowserWindow {
    const { width, height } = mainWindow && !mainWindow.isDestroyed()
      ? mainWindow.getBounds()
      : { width: 1366, height: 768 }

    const window = new BrowserWindow({
      show: false,
      width,
      height,
      webPreferences: {
        offscreen: false,
        sandbox: false,
        webSecurity: false,
        images: true
      }
    })

    window.webContents.setUserAgent(this.config.userAgent)

    // Handle window crashes
    window.webContents.on('render-process-gone', (_event, details) => {
      logger.error('search_window.render_process_gone', details)
      this.handleWindowCrash(window, this.searchWindows)
    })

    return window
  }

  /**
   * Create a content window with appropriate settings
   */
  private createContentWindow(): BrowserWindow {
    const window = new BrowserWindow({
      show: false,
      webPreferences: {
        offscreen: true,
        sandbox: false,
        images: false,
        webSecurity: false
      }
    })

    window.webContents.setUserAgent(this.config.userAgent)

    // Handle window crashes
    window.webContents.on('render-process-gone', (_event, details) => {
      logger.error('content_window.render_process_gone', details)
      this.handleWindowCrash(window, this.contentWindows)
    })

    return window
  }

  /**
   * Handle window crash by recreating it
   */
  private handleWindowCrash(crashedWindow: BrowserWindow, pool: PooledWindow[]): void {
    const index = pool.findIndex(w => w.window === crashedWindow)
    if (index !== -1) {
      const isSearchWindow = pool === this.searchWindows
      const newWindow = isSearchWindow ? this.createSearchWindow() : this.createContentWindow()

      pool[index] = {
        window: newWindow,
        inUse: false,
        createdAt: Date.now(),
        lastUsedAt: Date.now()
      }

      logger.warn('window.recreated_after_crash', {
        kind: isSearchWindow ? 'search' : 'content'
      })
    }
  }

  /**
   * Destroy all windows in the pool
   */
  destroy(): void {
    logger.info('destroy.started', {
      searchWindows: this.searchWindows.length,
      contentWindows: this.contentWindows.length
    })

    // Destroy all search windows
    for (const pooled of this.searchWindows) {
      if (!pooled.window.isDestroyed()) {
        pooled.window.destroy()
      }
    }

    // Destroy all content windows
    for (const pooled of this.contentWindows) {
      if (!pooled.window.isDestroyed()) {
        pooled.window.destroy()
      }
    }

    this.searchWindows = []
    this.contentWindows = []
    this.isInitialized = false

    logger.info('destroy.completed')
  }

  /**
   * Get pool statistics
   */
  getStats(): { search: { total: number; inUse: number; available: number }; content: { total: number; inUse: number; available: number } } {
    const searchInUse = this.searchWindows.filter(w => w.inUse).length
    const contentInUse = this.contentWindows.filter(w => w.inUse).length

    return {
      search: {
        total: this.searchWindows.length,
        inUse: searchInUse,
        available: this.searchWindows.length - searchInUse
      },
      content: {
        total: this.contentWindows.length,
        inUse: contentInUse,
        available: this.contentWindows.length - contentInUse
      }
    }
  }
}

// Singleton instance
let windowPool: BrowserWindowPool | null = null

export function getWindowPool(): BrowserWindowPool {
  if (!windowPool) {
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'

    windowPool = new BrowserWindowPool({
      searchWindowCount: 1,    // Pre-create 1 search windows
      contentWindowCount: 3,   // Pre-create 3 content windows for parallel scraping
      userAgent
    })
  }
  return windowPool
}

export function destroyWindowPool(): void {
  if (windowPool) {
    windowPool.destroy()
    windowPool = null
  }
}

export { BrowserWindowPool }

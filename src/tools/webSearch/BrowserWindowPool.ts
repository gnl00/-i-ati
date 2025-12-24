import { BrowserWindow } from 'electron'

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

class BrowserWindowPool {
  private searchWindows: PooledWindow[] = []
  private contentWindows: PooledWindow[] = []
  private config: WindowPoolConfig
  private isInitialized = false

  constructor(config: WindowPoolConfig) {
    this.config = config
  }

  /**
   * Initialize the window pool by creating all windows upfront
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('[WindowPool] Already initialized')
      return
    }

    console.log('[WindowPool] Initializing...')
    const startTime = Date.now()

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
    console.log(`[WindowPool] Initialized with ${this.searchWindows.length} search windows and ${this.contentWindows.length} content windows in ${initTime}ms`)
  }

  /**
   * Acquire a search window from the pool
   */
  async acquireSearchWindow(): Promise<BrowserWindow> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    // Find an available window
    const pooled = this.searchWindows.find(w => !w.inUse && !w.window.isDestroyed())

    if (!pooled) {
      // If no available window, create a new one
      console.log('[WindowPool] No available search window, creating new one')
      const window = this.createSearchWindow()
      const newPooled: PooledWindow = {
        window,
        inUse: true,
        createdAt: Date.now(),
        lastUsedAt: Date.now()
      }
      this.searchWindows.push(newPooled)
      return window
    }

    pooled.inUse = true
    pooled.lastUsedAt = Date.now()
    return pooled.window
  }

  /**
   * Acquire a content window from the pool
   */
  async acquireContentWindow(): Promise<BrowserWindow> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    // Find an available window
    const pooled = this.contentWindows.find(w => !w.inUse && !w.window.isDestroyed())

    if (!pooled) {
      // If no available window, create a new one
      console.log('[WindowPool] No available content window, creating new one')
      const window = this.createContentWindow()
      const newPooled: PooledWindow = {
        window,
        inUse: true,
        createdAt: Date.now(),
        lastUsedAt: Date.now()
      }
      this.contentWindows.push(newPooled)
      return window
    }

    pooled.inUse = true
    pooled.lastUsedAt = Date.now()
    return pooled.window
  }

  /**
   * Release a search window back to the pool
   */
  releaseSearchWindow(window: BrowserWindow): void {
    const pooled = this.searchWindows.find(w => w.window === window)
    if (pooled) {
      pooled.inUse = false
      pooled.lastUsedAt = Date.now()
      // Clear the window state
      this.clearWindowState(window)
    }
  }

  /**
   * Release a content window back to the pool
   */
  releaseContentWindow(window: BrowserWindow): void {
    const pooled = this.contentWindows.find(w => w.window === window)
    if (pooled) {
      pooled.inUse = false
      pooled.lastUsedAt = Date.now()
      // Clear the window state
      this.clearWindowState(window)
    }
  }

  /**
   * Clear window state (cookies, cache, history)
   */
  private clearWindowState(window: BrowserWindow): void {
    if (window.isDestroyed()) return

    try {
      // Stop any ongoing navigation
      window.webContents.stop()

      // Clear navigation history by loading about:blank
      window.loadURL('about:blank').catch(() => {
        // Ignore errors during cleanup
      })
    } catch (err) {
      console.error('[WindowPool] Error clearing window state:', err)
    }
  }

  /**
   * Create a search window with appropriate settings
   */
  private createSearchWindow(): BrowserWindow {
    const window = new BrowserWindow({
      show: false,
      width: 1366,
      height: 768,
      webPreferences: {
        offscreen: true,
        sandbox: false,
        webSecurity: false,
        images: false
      }
    })

    window.webContents.setUserAgent(this.config.userAgent)

    // Handle window crashes
    window.webContents.on('crashed', () => {
      console.error('[WindowPool] Search window crashed')
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
        images: false,
        webSecurity: false
      }
    })

    window.webContents.setUserAgent(this.config.userAgent)

    // Handle window crashes
    window.webContents.on('crashed', () => {
      console.error('[WindowPool] Content window crashed')
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

      console.log(`[WindowPool] Recreated ${isSearchWindow ? 'search' : 'content'} window after crash`)
    }
  }

  /**
   * Destroy all windows in the pool
   */
  destroy(): void {
    console.log('[WindowPool] Destroying all windows...')

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

    console.log('[WindowPool] All windows destroyed')
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
      searchWindowCount: 2,    // Pre-create 2 search windows
      contentWindowCount: 5,   // Pre-create 5 content windows for parallel scraping
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

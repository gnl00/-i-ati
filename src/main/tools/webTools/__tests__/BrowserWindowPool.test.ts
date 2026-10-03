import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@main/main-window', () => ({ mainWindow: undefined }))
vi.mock('@main/logging/LogService', () => ({
  createLogger: (): Record<string, ReturnType<typeof vi.fn>> => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))
vi.mock('electron', () => ({
  BrowserWindow: class {
    destroyed = false
    loadURL = vi.fn(async () => {})
    webContents = { stop: vi.fn(), setUserAgent: vi.fn(), on: vi.fn() }
    isDestroyed(): boolean { return this.destroyed }
    destroy(): void { this.destroyed = true }
  }
}))

import { BrowserWindowPool } from '../BrowserWindowPool'

function createPool(): BrowserWindowPool {
  return new BrowserWindowPool({ searchWindowCount: 1, contentWindowCount: 1, userAgent: 'test' })
}

afterEach(() => vi.useRealTimers())

describe('BrowserWindowPool', () => {
  it('does not stop a reused window when the previous cleanup timeout expires', async () => {
    vi.useFakeTimers()
    const pool = createPool()
    const window = await pool.acquireSearchWindow()
    await pool.releaseSearchWindow(window)
    expect(await pool.acquireSearchWindow()).toBe(window)
    vi.mocked(window.webContents.stop).mockClear()
    await vi.advanceTimersByTimeAsync(2100)
    expect(window.webContents.stop).not.toHaveBeenCalled()
    pool.destroy()
  })

  it('retires a hung window and restores capacity with a replacement', async () => {
    vi.useFakeTimers()
    const pool = createPool()
    const window = await pool.acquireContentWindow()
    vi.mocked(window.loadURL).mockImplementationOnce(() => new Promise(() => {}))
    const release = pool.releaseContentWindow(window)
    await vi.advanceTimersByTimeAsync(2000)
    await release
    expect(window.webContents.stop).toHaveBeenCalledTimes(2)
    expect(window.isDestroyed()).toBe(true)
    const replacement = await pool.acquireContentWindow()
    expect(replacement).not.toBe(window)
    await pool.releaseContentWindow(replacement)
    expect(pool.getStats().content.available).toBe(1)
    pool.destroy()
  })

  it('restores the permit when cancellation arrives just after acquisition', async () => {
    const pool = createPool()
    await pool.initialize()
    const controller = new AbortController()
    const acquiring = pool.acquireContentWindow(controller.signal)
    const rejected = expect(acquiring).rejects.toThrow('cancelled')
    controller.abort(new Error('cancelled'))
    await rejected
    expect(pool.getStats().content.inUse).toBe(0)
    const window = await pool.acquireContentWindow()
    await pool.releaseContentWindow(window)
    pool.destroy()
  })

  it('removes cancelled waiters without taking the next available window', async () => {
    const pool = createPool()
    const window = await pool.acquireContentWindow()
    const controller = new AbortController()
    const queued = pool.acquireContentWindow(controller.signal)
    const rejected = expect(queued).rejects.toThrow('cancelled')
    controller.abort(new Error('cancelled'))
    await rejected
    await pool.releaseContentWindow(window)
    expect(await pool.acquireContentWindow()).toBe(window)
    pool.destroy()
  })
})

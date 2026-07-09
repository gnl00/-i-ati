import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  return {
    netFetch: vi.fn(),
    acquireContentWindow: vi.fn(),
    releaseContentWindow: vi.fn(),
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }
  }
})

vi.mock('electron', () => ({
  net: {
    fetch: mocks.netFetch
  }
}))

vi.mock('@main/main-window', () => ({
  mainWindow: undefined
}))

vi.mock('@main/logging/LogService', () => ({
  createLogger: vi.fn(() => mocks.logger)
}))

vi.mock('@main/db/DatabaseService', () => ({
  default: {
    getConfig: vi.fn(() => ({}))
  }
}))

vi.mock('../BrowserWindowPool', () => ({
  getWindowPool: vi.fn(() => ({
    acquireContentWindow: mocks.acquireContentWindow,
    releaseContentWindow: mocks.releaseContentWindow
  }))
}))

import DatabaseService from '@main/db/DatabaseService'
import {
  processWebFetch,
  _withTimeout,
  _WEB_FETCH_TIMEOUT,
  _resolveConfiguredFetchCounts,
  _MAX_FETCH_COUNTS
} from '../WebToolsProcessor'

describe('WebToolsProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses Electron net.fetch for direct HTTP markdown URLs', async () => {
    mocks.netFetch.mockResolvedValue(new Response('# Title\n\nBody text', {
      status: 200,
      headers: {
        'content-type': 'text/markdown'
      }
    }))

    const url = 'https://raw.githubusercontent.com/google-labs-code/design.md/refs/heads/main/README.md'
    const result = await processWebFetch({ url, cleanMode: 'full' })

    expect(mocks.netFetch).toHaveBeenCalledWith(url, expect.objectContaining({
      redirect: 'follow',
      headers: expect.objectContaining({
        'User-Agent': expect.stringContaining('Mozilla/5.0')
      })
    }))
    expect(mocks.acquireContentWindow).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      success: true,
      url,
      title: 'README.md',
      content: '# Title\nBody text'
    })
  })

  it('returns an error within the overall deadline instead of hanging when fetch never settles', async () => {
    // 模拟慢速涓流响应：net.fetch 永不 settle（既不 resolve 也不 reject）。
    // 修复前 processWebFetch 未套整体超时且 signal 为 undefined，此调用会永久挂死；
    // 修复后整体 withTimeout（WEB_FETCH_TIMEOUT）会 abort 并让 processWebFetch 返回 error。
    vi.useFakeTimers()
    try {
      mocks.netFetch.mockReturnValue(new Promise(() => {}))
      // 渲染回退同样永不 settle，模拟连渲染路径也卡死——只有外层整体超时能兜底
      mocks.acquireContentWindow.mockReturnValue(new Promise(() => {}))

      const url = 'https://example.com/slow-trickle-page'
      const resultPromise = processWebFetch({ url, cleanMode: 'lite' })

      // 推进超过整体 deadline（派生自内层子超时之和），超时应触发而非永久 pending
      await vi.advanceTimersByTimeAsync(_WEB_FETCH_TIMEOUT)
      const result = await resultPromise

      expect(result).toMatchObject({
        success: false,
        url,
        error: expect.stringContaining('Timeout fetching page')
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('logs transport and undici cause details when direct HTTP fetch fails', async () => {
    const error = new TypeError('fetch failed')
    Object.assign(error, {
      cause: Object.assign(new Error('getaddrinfo ENOTFOUND raw.githubusercontent.com'), {
        code: 'ENOTFOUND',
        errno: -3008,
        syscall: 'getaddrinfo',
        hostname: 'raw.githubusercontent.com'
      })
    })
    mocks.netFetch.mockRejectedValue(error)

    const url = 'https://raw.githubusercontent.com/google-labs-code/design.md/refs/heads/main/README.md'
    const result = await processWebFetch({ url, cleanMode: 'full' })

    expect(result).toMatchObject({
      success: false,
      url,
      error: 'fetch failed'
    })
    expect(mocks.logger.warn).toHaveBeenCalledWith('web_fetch.direct_http_request_failed', expect.objectContaining({
      url,
      transport: 'electron-net-fetch',
      causeCode: 'ENOTFOUND',
      causeHostname: 'raw.githubusercontent.com'
    }))
  })
})

describe('withTimeout', () => {
  it('aborts the factory signal when the timeout fires', async () => {
    vi.useFakeTimers()
    try {
      let observedAborted = false
      // factory 永不 settle，仅在收到 abort 时记录标志——超时 reject 是唯一的
      // race 结果，避免 factory 自己也 reject 产生 unhandled rejection。
      const task = _withTimeout<string>((signal) => {
        return new Promise<string>(() => {
          signal.addEventListener('abort', () => {
            observedAborted = true
          })
        })
      }, 1000, 'timed out')

      const assertion = expect(task).rejects.toThrow('timed out')
      await vi.advanceTimersByTimeAsync(1000)
      await assertion
      expect(observedAborted).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('resolves with the factory result when it settles before the timeout', async () => {
    const result = await _withTimeout(async () => 'done', 1000, 'timed out')
    expect(result).toBe('done')
  })
})

describe('resolveConfiguredFetchCounts', () => {
  it('clamps an explicit fetchCounts above the hard cap down to MAX_FETCH_COUNTS', () => {
    expect(_resolveConfiguredFetchCounts(100)).toBe(_MAX_FETCH_COUNTS)
  })

  it('clamps an oversized configured value from DatabaseService down to MAX_FETCH_COUNTS', () => {
    vi.mocked(DatabaseService.getConfig).mockReturnValueOnce({
      tools: { maxWebSearchItems: 999 }
    } as any)
    expect(_resolveConfiguredFetchCounts(undefined)).toBe(_MAX_FETCH_COUNTS)
  })

  it('passes through a value within the cap unchanged', () => {
    expect(_resolveConfiguredFetchCounts(5)).toBe(5)
  })
})

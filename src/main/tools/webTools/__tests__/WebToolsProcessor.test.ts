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

import { processWebFetch } from '../WebToolsProcessor'

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

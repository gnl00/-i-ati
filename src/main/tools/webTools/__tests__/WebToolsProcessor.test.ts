import { mkdtemp, readFile, readdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { EventEmitter } from 'events'
import { performance } from 'node:perf_hooks'

const mocks = vi.hoisted(() => {
  return {
    netFetch: vi.fn(),
    getPath: vi.fn(),
    acquireContentWindow: vi.fn(),
    releaseContentWindow: vi.fn(),
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    },
    acquireSearchWindow: vi.fn(),
    releaseSearchWindow: vi.fn()
  }
})

vi.mock('electron', () => ({
  app: {
    getPath: mocks.getPath
  },
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
    getConfig: vi.fn(() => ({})),
    getWorkspacePathByUuid: vi.fn(() => undefined)
  }
}))

vi.mock('../BrowserWindowPool', () => ({
  getWindowPool: vi.fn(() => ({
    acquireSearchWindow: mocks.acquireSearchWindow,
    releaseSearchWindow: mocks.releaseSearchWindow,
    acquireContentWindow: mocks.acquireContentWindow,
    releaseContentWindow: mocks.releaseContentWindow
  }))
}))

import DatabaseService from '@main/db/DatabaseService'
import {
  processWebFetch,
  processWebSearch,
  _withTimeout,
  _WEB_FETCH_TIMEOUT,
  _resolveConfiguredFetchCounts,
  _MAX_FETCH_COUNTS,
  _classifyBingSearchPage,
  _classifyGoogleSearchPage,
  _assessSearchResultQuality
} from '../WebToolsProcessor'
import { WorkspaceWebFetchArtifactService } from '../artifacts/WorkspaceWebFetchArtifactService'

function createSimplePdf(text: string): Uint8Array {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ]
  const stream = `BT /F1 18 Tf 72 720 Td (${text.replace(/[()\\]/g, '\\$&')}) Tj ET`
  objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`)
  let body = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body))
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xrefOffset = Buffer.byteLength(body)
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let index = 1; index < offsets.length; index++) {
    body += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return new TextEncoder().encode(body)
}

const degradedBingSnapshot = {
  currentUrl: 'https://www.bing.com/search?q=Time%20Machine',
  title: 'Time Machine - 搜索',
  bodyPreview: '跳至内容 辅助功能反馈 全部搜索图片视频地图资讯 更多 隐私 条款',
  bodyTextLength: 44
}

const normalBingSnapshot = {
  currentUrl: 'https://www.bing.com/search?q=Time%20Machine%20backup%20disk%20Apple%20support',
  title: 'Time Machine backup disk Apple support - 搜索',
  bodyPreview: '跳至内容 辅助功能反馈 全部搜索图片视频地图资讯 更多 约 10,000 个结果 Apple Support Time Machine',
  bodyTextLength: 500
}

const irrelevantTimeResults = [
  {
    link: 'https://www.timeanddate.com/',
    title: 'timeanddate.com',
    snippet: 'Current local time around the world and time zone information.'
  },
  {
    link: 'https://time.is/_',
    title: 'Time.is - 所有时区的精确时间',
    snippet: 'Your time is exact. Current local time and time zone information.'
  },
  {
    link: 'https://time.gov/?x=1',
    title: 'Time.gov',
    snippet: 'Official United States time with clocks and time zones.'
  }
]

function createContentWindow(url: string, body: string): {
  loadURL: Mock<(requestedUrl?: string) => Promise<void>>
  isDestroyed: Mock<() => boolean>
  destroy: Mock
  webContents: {
    session: EventEmitter
    stop: Mock
    getURL: Mock<() => string>
    executeJavaScript: Mock<(script: string) => Promise<string | { html: string, title: string, finalUrl: string, contentSnapshot: string }>>
  }
} {
  let currentUrl = url
  return {
    loadURL: vi.fn(async (requestedUrl?: string) => { currentUrl = requestedUrl || url }),
    isDestroyed: vi.fn(() => false),
    destroy: vi.fn(),
    webContents: {
      session: new EventEmitter(),
      stop: vi.fn(),
      getURL: vi.fn(() => url),
      executeJavaScript: vi.fn(async (script: string) => script.includes('html:')
        ? { html: `<body><main>${body}</main></body>`, title: 'Rendered page', finalUrl: currentUrl, contentSnapshot: body }
        : body)
    }
  }
}

function createSearchWindow(snapshot: object, items: object[]): {
  loadURL: ReturnType<typeof vi.fn<() => Promise<undefined>>>
  isDestroyed: ReturnType<typeof vi.fn<() => boolean>>
  destroy: ReturnType<typeof vi.fn>
  webContents: {
    executeJavaScript: ReturnType<typeof vi.fn<(script: string) => Promise<object | object[] | boolean>>>
    getURL: ReturnType<typeof vi.fn<() => string>>
    stop: ReturnType<typeof vi.fn>
  }
} {
  return {
    loadURL: vi.fn().mockResolvedValue(undefined),
    isDestroyed: vi.fn(() => false),
    destroy: vi.fn(),
    webContents: {
      executeJavaScript: vi.fn(async (script: string) => {
        if (script.includes('bodyPreview')) return snapshot
        if (script.includes('const results = []')) return items
        return true
      }),
      getURL: vi.fn(() => (snapshot as { currentUrl?: string }).currentUrl || ''),
      stop: vi.fn()
    }
  }
}

describe('WebToolsProcessor', () => {
  let userDataDir: string

  beforeEach(async () => {
    vi.resetAllMocks()
    userDataDir = await mkdtemp(join(tmpdir(), 'ati-web-tools-'))
    mocks.getPath.mockReturnValue(userDataDir)
  })

  afterEach(async () => {
    await rm(userDataDir, { recursive: true, force: true })
  })

  it('returns discovery metadata without reading source pages or creating artifacts', async () => {
    const link = 'https://example.com/article'
    const window = createSearchWindow(normalBingSnapshot, [
      { link, title: 'Example article', snippet: 'Example search snippet' }
    ])
    mocks.acquireSearchWindow.mockResolvedValueOnce(window)
    const result = await processWebSearch({ query: 'example' })
    expect(result).toEqual({
      success: true,
      results: [{ query: 'example', success: true, link, title: 'Example article', snippet: 'Example search snippet' }]
    })
    expect(mocks.acquireContentWindow).not.toHaveBeenCalled()
    expect(mocks.netFetch).not.toHaveBeenCalled()
    expect(mocks.getPath).not.toHaveBeenCalled()
    expect(await readdir(userDataDir)).toEqual([])
    expect(mocks.releaseSearchWindow).toHaveBeenCalledWith(window)
  })

  it('deduplicates and orders sources before fetching content', async () => {
    const links = [
      'https://discussions.apple.com/thread/1',
      'https://support.apple.com/en-au/guide/mac-help/article/mac',
      'https://support.apple.com/en-tm/guide/mac-help/article/mac',
      'https://support.apple.com/en-us/104984'
    ]
    mocks.acquireSearchWindow.mockResolvedValueOnce(createSearchWindow(normalBingSnapshot,
      links.map(link => ({ link, title: 'Apple Time Machine backup', snippet: 'Apple backup documentation' }))
    ))
    const result = await processWebSearch({ query: 'Apple Time Machine backup', fetchCounts: 2 })
    expect(result.results.map(item => item.link)).toEqual([links[1], links[3]])
    expect(mocks.acquireContentWindow).not.toHaveBeenCalled()
    expect(mocks.netFetch).not.toHaveBeenCalled()
  })

  it('preserves the noninteractive Google verification fallback without fetching sources', async () => {
    const google = createSearchWindow({
      currentUrl: 'https://www.google.com/sorry/index', title: 'Verify you are human',
      bodyPreview: 'Our systems have detected unusual traffic.', bodyTextLength: 100
    }, [])
    const bing = createSearchWindow(normalBingSnapshot, [
      { link: 'https://example.com/source', title: 'Example source', snippet: 'Example excerpt' }
    ])
    mocks.acquireSearchWindow.mockResolvedValueOnce(google).mockResolvedValueOnce(bing)
    expect(await processWebSearch({ query: 'Example', engine: 'google' })).toMatchObject({
      success: true, results: [{ title: 'Example source', snippet: 'Example excerpt' }]
    })
    expect(mocks.acquireSearchWindow).toHaveBeenCalledTimes(2)
    expect(mocks.releaseSearchWindow).toHaveBeenCalledWith(google)
    expect(mocks.releaseSearchWindow).toHaveBeenCalledWith(bing)
    expect(mocks.acquireContentWindow).not.toHaveBeenCalled()
    expect(mocks.netFetch).not.toHaveBeenCalled()
  })

  it('reads only a selected source through an explicit web_fetch call', async () => {
    const links = ['https://example.com/selected', 'https://example.com/other']
    mocks.acquireSearchWindow.mockResolvedValueOnce(createSearchWindow(normalBingSnapshot,
      links.map(link => ({ link, title: 'Example article', snippet: 'Example search snippet' }))
    ))
    const search = await processWebSearch({ query: 'example', fetchCounts: 2 })
    expect(search.results).toHaveLength(2)
    expect(mocks.acquireContentWindow).not.toHaveBeenCalled()
    const window = createContentWindow(links[0], 'Selected source body.')
    mocks.acquireContentWindow.mockResolvedValueOnce(window)
    expect(await processWebFetch({ url: search.results[0].link })).toMatchObject({
      success: true, content: 'Selected source body.'
    })
    expect(mocks.acquireContentWindow).toHaveBeenCalledOnce()
    expect(window.loadURL).toHaveBeenCalledWith(links[0], expect.anything())
  })

  it.each([
    { html: '<body></body>', title: 'Empty page', error: 'WEB_FETCH_EMPTY_CONTENT' },
    { html: '<body>Request blocked.</body>', title: 'Access denied', error: 'WEB_FETCH_BLOCKED_PAGE' }
  ])('rejects $error after rendered extraction and returns the window', async ({ html, title, error }) => {
    const url = 'https://example.com/rendered-page'
    const window = {
      loadURL: vi.fn(async () => {}),
      isDestroyed: vi.fn(() => false),
      destroy: vi.fn(),
      webContents: {
        session: new EventEmitter(),
        stop: vi.fn(), getURL: vi.fn(() => url),
        executeJavaScript: vi.fn(async (script: string) => script.includes('html:')
          ? { html, title, finalUrl: url, contentSnapshot: 'Useful content' }
          : 'Useful content')
      }
    }
    mocks.acquireContentWindow.mockResolvedValueOnce(window)
    expect(await processWebFetch({ url })).toMatchObject({ success: false, error })
    expect(mocks.releaseContentWindow).toHaveBeenCalledWith(window)
  })

  it('retires an active rendered window when the run is cancelled and returns its permit', async () => {
    const controller = new AbortController()
    const url = 'https://example.com/rendered-page'
    let started!: () => void
    const ready = new Promise<void>(resolve => { started = resolve })
    let destroyed = false
    const window = {
      loadURL: vi.fn((): Promise<never> => {
        started()
        return new Promise(() => {})
      }),
      isDestroyed: vi.fn(() => destroyed),
      destroy: vi.fn(() => { destroyed = true }),
      webContents: { stop: vi.fn(), session: new EventEmitter() }
    }
    mocks.acquireContentWindow.mockResolvedValueOnce(window)
    const fetching = processWebFetch({ url }, { signal: controller.signal })
    await ready
    controller.abort(new Error('Run stopped'))
    expect(await fetching).toMatchObject({ success: false, error: 'Run stopped' })
    await vi.waitFor(() => expect(mocks.releaseContentWindow).toHaveBeenCalledWith(window))
    expect(window.destroy).toHaveBeenCalledTimes(1)
  })

  it('renders a webpage directly and accepts a complete short article', async () => {
    const url = 'https://example.com/article'
    const window = createContentWindow(url, 'A complete short article.')
    let clock = 0
    const now = vi.spyOn(performance, 'now').mockImplementation(() => clock)
    mocks.acquireContentWindow.mockImplementationOnce(async () => { clock += 40; return window })
    window.loadURL.mockImplementationOnce(async () => { clock += 120 })
    mocks.releaseContentWindow.mockImplementationOnce(async () => { clock += 10 })
    try {
      const result = await processWebFetch({ url })
      expect(result).toMatchObject({ success: true, content: 'A complete short article.' })
      expect(result).not.toHaveProperty('phaseDurationsMs')
      const timings = mocks.logger.info.mock.calls.find(([event]) => event === 'web_fetch.timings')?.[1]
      expect(timings).toMatchObject({
        success: true, route: 'render', outputKind: 'inline', readinessOutcome: 'stable',
        durationMs: 170, inFlightPhases: [],
        phaseDurationsMs: {
          queue: 40, navigation: 120, readiness: 0, domExtraction: 0,
          contentExtraction: 0, materialization: 0, release: 10
        }
      })
      expect(mocks.logger.info).toHaveBeenCalledWith('web_fetch.started', expect.objectContaining({ fetchId: timings.fetchId }))
      expect(mocks.logger.info).toHaveBeenCalledWith('web_fetch.completed', expect.objectContaining({ fetchId: timings.fetchId }))
    } finally {
      now.mockRestore()
    }
    expect(window.loadURL).toHaveBeenCalledWith(url, expect.anything())
    expect(mocks.netFetch).not.toHaveBeenCalled()
    expect(mocks.releaseContentWindow).toHaveBeenCalledWith(window)
  })

  it.each(['navigation', 'extraction'])('returns a %s error without HTTP fallback', async phase => {
    const window = createContentWindow('https://example.com/article', 'Article body')
    if (phase === 'navigation') window.loadURL.mockRejectedValue(new Error('Navigation failed'))
    else window.webContents.executeJavaScript.mockImplementation(async script => {
      if (script.includes('html:')) throw new Error('Extraction failed')
      return 'Article body'
    })
    mocks.acquireContentWindow.mockResolvedValueOnce(window)
    expect(await processWebFetch({ url: 'https://example.com/article' })).toMatchObject({ success: false })
    expect(mocks.netFetch).not.toHaveBeenCalled()
    expect(mocks.releaseContentWindow).toHaveBeenCalledWith(window)
    expect(window.webContents.session.listenerCount('will-download')).toBe(0)
    expect(mocks.logger.info).toHaveBeenCalledWith('web_fetch.timings', expect.objectContaining({
      success: false, failedPhase: phase === 'navigation' ? 'navigation' : 'domExtraction',
      phaseDurationsMs: expect.objectContaining({ release: expect.any(Number) })
    }))
  })

  it('routes an extensionless file download to the workspace downloader', async () => {
    const url = 'https://example.com/download'
    const window = createContentWindow(url, '')
    const preventDefault = vi.fn()
    window.loadURL.mockImplementation(async () => {
      window.webContents.session.emit('will-download', { preventDefault }, { getURL: () => url }, window.webContents)
      throw new Error('ERR_ABORTED')
    })
    mocks.acquireContentWindow.mockResolvedValueOnce(window)
    mocks.netFetch.mockResolvedValueOnce(new Response(new Uint8Array([0, 1, 2]).buffer))
    const result = await processWebFetch({ url })
    expect(result.success).toBe(true)
    expect(result.artifact?.mimeType).toBe('application/octet-stream')
    expect(mocks.logger.info).toHaveBeenCalledWith('web_fetch.timings', expect.objectContaining({
      success: true, route: 'render-download', outputKind: 'artifact',
      phaseDurationsMs: expect.objectContaining({
        navigation: expect.any(Number), httpDownload: expect.any(Number), httpMaterialization: expect.any(Number)
      })
    }))
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(window.webContents.session.listenerCount('will-download')).toBe(0)
    expect(mocks.releaseContentWindow).toHaveBeenCalledWith(window)
  })

  it('handles a download event after Chromium rejects navigation', async () => {
    vi.useFakeTimers()
    try {
      const url = 'https://example.com/download'
      const window = createContentWindow(url, '')
      window.loadURL.mockImplementation(async () => {
        setTimeout(() => window.webContents.session.emit('will-download',
          { preventDefault: vi.fn() }, { getURL: () => url }, window.webContents), 100)
        throw Object.assign(new Error('Navigation became a download'), { code: 'ERR_FAILED' })
      })
      mocks.acquireContentWindow.mockResolvedValueOnce(window)
      mocks.netFetch.mockResolvedValueOnce(new Response('Downloaded content'))
      const result = processWebFetch({ url })
      await vi.advanceTimersByTimeAsync(100)
      expect(await result).toMatchObject({ success: true, content: 'Downloaded content' })
      expect(window.webContents.session.listenerCount('will-download')).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects a loading shell at the readiness deadline without fetching over HTTP', async () => {
    vi.useFakeTimers()
    try {
      const window = createContentWindow('https://example.com/loading', 'Loading...')
      window.webContents.executeJavaScript.mockImplementation(async script => script.includes('html:')
        ? { html: '<main>Loading...</main>', title: 'Loading page', finalUrl: 'https://example.com/loading', contentSnapshot: '' }
        : '')
      mocks.acquireContentWindow.mockResolvedValueOnce(window)
      const result = processWebFetch({ url: 'https://example.com/loading' })
      await vi.advanceTimersByTimeAsync(8000)
      expect(await result).toMatchObject({ success: false, error: 'WEB_FETCH_CONTENT_NOT_READY' })
      expect(mocks.netFetch).not.toHaveBeenCalled()
      expect(mocks.releaseContentWindow).toHaveBeenCalledWith(window)
    } finally {
      vi.useRealTimers()
    }
  })

  it('retires a renderer whose DOM extraction hangs and releases its window', async () => {
    vi.useFakeTimers()
    try {
      const window = createContentWindow('https://example.com/hung', 'Article')
      window.webContents.executeJavaScript.mockImplementation(script => script.includes('html:')
        ? new Promise(() => {}) : Promise.resolve('Article'))
      mocks.acquireContentWindow.mockResolvedValueOnce(window)
      const result = processWebFetch({ url: 'https://example.com/hung' })
      await vi.advanceTimersByTimeAsync(9000)
      expect(await result).toMatchObject({ success: false, error: expect.stringContaining('Timeout extracting page') })
      expect(window.destroy).toHaveBeenCalledOnce()
      expect(mocks.releaseContentWindow).toHaveBeenCalledWith(window)
      expect(mocks.netFetch).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('materializes a large rendered article using the existing artifact budget', async () => {
    const window = createContentWindow('https://example.com/large', 'Article text. '.repeat(4000))
    mocks.acquireContentWindow.mockResolvedValueOnce(window)
    const result = await processWebFetch({ url: 'https://example.com/large' })
    expect(result.success).toBe(true)
    expect(result.artifact?.mimeType).toContain('text/markdown')
    expect(result.content.length).toBeLessThan(4000)
    expect(mocks.netFetch).not.toHaveBeenCalled()
  })

  it('rejects empty direct text instead of returning successful empty content', async () => {
    mocks.netFetch.mockResolvedValueOnce(new Response('', {
      headers: { 'content-type': 'text/plain' }
    }))
    const result = await processWebFetch({ url: 'https://example.com/empty.txt' })
    expect(result).toMatchObject({ success: false, error: 'WEB_FETCH_EMPTY_CONTENT' })
    expect(mocks.acquireContentWindow).not.toHaveBeenCalled()
  })

  it('rejects a verification page even when its body is large enough for an artifact', async () => {
    mocks.netFetch.mockResolvedValueOnce(new Response(
      `<html><title>Just a moment...</title><body>${'Checking your browser. '.repeat(2000)}</body></html>`,
      { headers: { 'content-type': 'text/html' } }
    ))
    const result = await processWebFetch({ url: 'https://example.com/check.txt' })
    expect(result).toMatchObject({ success: false, error: 'WEB_FETCH_BLOCKED_PAGE' })
    const workspace = new WorkspaceWebFetchArtifactService()
    const probe = await workspace.allocateSpool()
    await workspace.cleanupSpool(probe)
    expect(await readdir(join(probe.absolutePath, '..'))).toEqual([])
  })

  it('propagates run cancellation to the active direct HTTP request', async () => {
    const controller = new AbortController()
    let started!: () => void
    const ready = new Promise<void>(resolve => { started = resolve })
    let transportSignal: AbortSignal | undefined
    mocks.netFetch.mockImplementationOnce((_url, options) => {
      transportSignal = options.signal
      started()
      return new Promise((_resolve, reject) => {
        transportSignal!.addEventListener('abort', () => reject(transportSignal!.reason), { once: true })
      })
    })
    const fetching = processWebFetch({ url: 'https://example.com/article.txt' }, { signal: controller.signal })
    await ready
    controller.abort(new Error('Run stopped'))
    expect(await fetching).toMatchObject({ success: false, error: 'Run stopped' })
    expect(transportSignal?.aborted).toBe(true)
    expect(mocks.acquireContentWindow).not.toHaveBeenCalled()
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
      content: '# Title\n\nBody text'
    })
    const timings = mocks.logger.info.mock.calls.find(([event]) => event === 'web_fetch.timings')?.[1]
    expect(timings).toMatchObject({ success: true, route: 'http', outputKind: 'inline', inFlightPhases: [] })
    expect(Object.keys(timings.phaseDurationsMs)).toEqual(['spoolAllocation', 'httpDownload', 'httpMaterialization'])
  })

  it('returns an error within the overall deadline instead of hanging when fetch never settles', async () => {
    // Queueing is part of the overall deadline even if acquisition never settles.
    vi.useFakeTimers()
    try {
      mocks.acquireContentWindow.mockReturnValue(new Promise(() => {}))

      const url = 'https://example.com/slow-trickle-page'
      const resultPromise = processWebFetch({ url, cleanMode: 'lite' })

      // The request must return when its overall deadline expires.
      await vi.advanceTimersByTimeAsync(_WEB_FETCH_TIMEOUT)
      const result = await resultPromise

      expect(result).toMatchObject({
        success: false,
        url,
        error: expect.stringContaining('Timeout fetching page')
      })
      expect(mocks.logger.info).toHaveBeenCalledWith('web_fetch.timings', expect.objectContaining({
        success: false, route: 'render', inFlightPhases: ['queue'],
        phaseDurationsMs: { queue: expect.any(Number) }
      }))
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

  it('preserves a small PDF as a raw workspace artifact', async () => {
    const pdf = createSimplePdf('Small PDF text')
    const pdfBody = new ArrayBuffer(pdf.length)
    new Uint8Array(pdfBody).set(pdf)
    mocks.netFetch.mockResolvedValue(new Response(pdfBody, {
      status: 200,
      headers: { 'content-type': 'application/pdf' }
    }))

    const result = await processWebFetch({
      url: 'https://example.com/small.pdf',
      cleanMode: 'full',
      chat_uuid: 'pdf-small'
    })

    expect(result.success).toBe(true)
    expect(result.artifact).toMatchObject({
      kind: 'workspace_artifact',
      sizeBytes: pdf.length,
      mimeType: 'application/pdf'
    })
    expect(result.content).toContain('Inspect the source file with a suitable workspace file-reading tool.')
    const workspace = join(userDataDir, 'workspaces', 'pdf-small')
    expect(await readFile(join(workspace, result.artifact!.sourcePath))).toEqual(Buffer.from(pdf))
    expect(result.artifact!.readPath).toBe(result.artifact!.sourcePath)
  })

  it('keeps an EZ3i-sized PDF in one tmp file with a bounded descriptor', async () => {
    const pdf = createSimplePdf('EZ3i manual text')
    const fixture = new Uint8Array(7_076_983).fill(0x20)
    fixture.set(pdf)
    mocks.netFetch.mockResolvedValue(new Response(fixture, {
      status: 200,
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': '1'
      }
    }))

    const result = await processWebFetch({
      url: 'https://example.com/manual.pdf',
      cleanMode: 'full',
      chat_uuid: 'pdf-large'
    })

    expect(result.success).toBe(true)
    expect(result.content.length).toBeLessThan(4_000)
    expect(result.content).toContain('Source file:')
    expect(result.content).toContain('MIME: application/pdf')
    expect(result.artifact).toMatchObject({
      kind: 'workspace_artifact',
      sizeBytes: 7_076_983,
      mimeType: 'application/pdf'
    })
    expect(result.artifact).not.toHaveProperty('pageCount')
    const workspace = join(userDataDir, 'workspaces', 'pdf-large')
    const source = await readFile(join(workspace, result.artifact!.sourcePath))
    const readable = await readFile(join(workspace, result.artifact!.readPath), 'utf-8')
    expect(source.byteLength).toBe(7_076_983)
    expect(source.subarray(0, pdf.length)).toEqual(Buffer.from(pdf))
    expect(Buffer.byteLength(readable)).toBeGreaterThan(0)
    expect(await readdir(join(workspace, '.tmp', 'web-fetch'))).toHaveLength(1)
  }, 15_000)

  it('saves extracted text when it exceeds the inline character budget', async () => {
    mocks.netFetch.mockResolvedValue(new Response(`heading\n${'content '.repeat(9_000)}`, {
      status: 200,
      headers: { 'content-type': 'text/plain' }
    }))
    const result = await processWebFetch({
      url: 'https://example.com/long.txt',
      cleanMode: 'full',
      chat_uuid: 'long-small-source'
    })
    expect(result.success).toBe(true)
    expect(result.artifact?.sizeBytes).toBeLessThan(3 * 1024 * 1024)
    expect(result.content.length).toBeLessThan(4_000)
  })

  it('preserves a small unknown binary as an octet-stream artifact with a bounded diagnostic', async () => {
    mocks.netFetch.mockResolvedValue(new Response(new Uint8Array([0, 1, 2, 3]).buffer, {
      status: 200
    }))
    const result = await processWebFetch({
      url: 'https://example.com/download.bin',
      chat_uuid: 'small-binary'
    })
    expect(result.success).toBe(true)
    expect(result.artifact?.mimeType).toBe('application/octet-stream')
    const saved = await readFile(
      join(userDataDir, 'workspaces', 'small-binary', result.artifact!.readPath)
    )
    expect(saved).toEqual(Buffer.from([0, 1, 2, 3]))
  })

  it('stores each completed result directly in one tmp file', async () => {
    const service = new WorkspaceWebFetchArtifactService('direct-tmp')
    const spool = await service.allocateSpool()
    await service.writeSpool(spool, new TextEncoder().encode('<html>source</html>'))
    const result = await service.saveResult({ spool, contentType: 'text/html',
      readableContent: 'Readable body', summary: 'body' })
    expect(result.readPath).toMatch(/^\.tmp\/web-fetch\/[^/]+\.tmp$/)
    expect(result.sourcePath).toBe(result.readPath)
    expect(await readFile(spool.absolutePath, 'utf8')).toBe('Readable body')
    expect(await readdir(join(userDataDir, 'workspaces', 'direct-tmp', '.tmp', 'web-fetch')))
      .toHaveLength(1)
    await expect(readdir(join(userDataDir, 'workspaces', 'direct-tmp', '.ati')))
      .rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('removes an aborted result instead of returning its path', async () => {
    const service = new WorkspaceWebFetchArtifactService('cancel-tmp')
    const spool = await service.allocateSpool()
    const controller = new AbortController()
    controller.abort()
    await expect(service.saveResult({ spool, contentType: 'text/plain',
      readableContent: 'body', summary: '', signal: controller.signal })).rejects.toThrow()
    await expect(readFile(spool.absolutePath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

})

describe('web search quality gate', () => {
  it('bounds a stuck search navigation and releases the search window', async () => {
    vi.useFakeTimers()
    try {
      const window = createSearchWindow(normalBingSnapshot, [])
      window.loadURL.mockReturnValue(new Promise<undefined>(() => {}))
      mocks.acquireSearchWindow.mockResolvedValueOnce(window)
      const result = processWebSearch({ query: 'Time Machine' })
      await vi.advanceTimersByTimeAsync(23000)
      expect(await result).toMatchObject({ success: false, error: 'Timeout loading search page' })
      expect(mocks.releaseSearchWindow).toHaveBeenCalledWith(window)
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops and releases the search window on run cancellation', async () => {
    const controller = new AbortController()
    const window = createSearchWindow(normalBingSnapshot, [])
    let started!: () => void
    const ready = new Promise<void>(resolve => { started = resolve })
    window.loadURL.mockImplementation(() => {
      started()
      return new Promise<undefined>(() => {})
    })
    mocks.acquireSearchWindow.mockResolvedValueOnce(window)
    const search = processWebSearch({ query: 'Time Machine' }, { signal: controller.signal })
    await ready
    controller.abort(new Error('Run stopped'))
    expect(await search).toMatchObject({ success: false, error: 'Run stopped' })
    await vi.waitFor(() => expect(mocks.releaseSearchWindow).toHaveBeenCalledWith(window))
    expect(window.webContents.stop).toHaveBeenCalled()
  })

  const timeMachineQueries = [
    'Time Machine 备份磁盘 必须比 内置硬盘 大吗 要求 官方',
    'Time Machine backup disk must be at least as large as startup disk Apple requirement'
  ]

  it.each(timeMachineQueries)('rejects a Bing navigation-only page for query: %s', async query => {
    const searchWindow = createSearchWindow(degradedBingSnapshot, irrelevantTimeResults)
    mocks.acquireSearchWindow.mockResolvedValueOnce(searchWindow)

    const result = await processWebSearch({
      engine: 'bing',
      fetchCounts: 5,
      query,
    })

    expect(result).toMatchObject({
      success: false,
      results: [],
      error: 'BING_SEARCH_DEGRADED_PAGE'
    })
    expect(mocks.releaseSearchWindow).toHaveBeenCalledWith(searchWindow)
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      'web_search.quality_gate_rejected',
      expect.objectContaining({ reason: 'bing_degraded_page', query })
    )
  })

  it.each(timeMachineQueries)('rejects irrelevant Bing results for query: %s', query => {
    expect(_assessSearchResultQuality(
      'bing',
      query,
      normalBingSnapshot,
      irrelevantTimeResults
    )).toMatchObject({
      accepted: false,
      error: 'SEARCH_RESULTS_LOW_RELEVANCE',
      reason: 'low_relevance',
      matchedResultCount: 0
    })
  })

  it('releases the search window when the post-extraction quality gate rejects results', async () => {
    const searchWindow = createSearchWindow(normalBingSnapshot, irrelevantTimeResults)
    mocks.acquireSearchWindow.mockResolvedValueOnce(searchWindow)

    const result = await processWebSearch({
      engine: 'bing',
      fetchCounts: 5,
      query: 'Time Machine backup disk Apple support',
    })

    expect(result).toMatchObject({
      success: false,
      results: [],
      error: 'SEARCH_RESULTS_LOW_RELEVANCE'
    })
    expect(mocks.releaseSearchWindow).toHaveBeenCalledWith(searchWindow)
  })

  it('accepts a normal Bing result when a reliable query signal matches', async () => {
    expect(_classifyBingSearchPage(degradedBingSnapshot)).toBe('degraded')
    expect(_classifyBingSearchPage(normalBingSnapshot)).toBe('result')

    const items = [{
      link: 'https://support.apple.com/en-us/104984',
      title: 'Back up your Mac with Time Machine - Apple Support',
      snippet: 'Use Time Machine to back up your Mac.'
    }]
    const searchWindow = createSearchWindow(normalBingSnapshot, items)
    mocks.acquireSearchWindow.mockResolvedValueOnce(searchWindow)

    const result = await processWebSearch({
      engine: 'bing',
      fetchCounts: 5,
      query: 'Time Machine backup disk Apple support',
    })

    expect(result).toMatchObject({ success: true, results: items })
    expect(mocks.releaseSearchWindow).toHaveBeenCalledWith(searchWindow)
  })

  it('allows a result when a reliable signal appears only in the hostname', () => {
    expect(_assessSearchResultQuality(
      'bing',
      'Time Machine',
      normalBingSnapshot,
      [{
        link: 'https://machine.example.com/support',
        title: 'Support article',
        snippet: 'A general support article.'
      }]
    )).toMatchObject({ accepted: true, matchedResultCount: 1 })
  })

  it('keeps Google result and anti-bot classification unchanged', () => {
    expect(_classifyGoogleSearchPage({
      currentUrl: 'https://www.google.com/sorry/index?continue=%2Fsearch',
      title: 'Before you continue',
      bodyPreview: 'Our systems have detected unusual traffic from your computer network.',
      bodyTextLength: 100
    })).toBe('anti_bot')
    expect(_classifyGoogleSearchPage({
      currentUrl: 'https://www.google.com/search?q=Time%20Machine',
      title: 'Time Machine - Google Search',
      bodyPreview: 'Time Machine results Apple Support',
      bodyTextLength: 300
    })).toBe('result')
    expect(_assessSearchResultQuality(
      'google',
      'Apple Time Machine',
      {
        currentUrl: 'https://www.google.com/search?q=Apple%20Time%20Machine',
        title: 'Apple Time Machine - Google Search',
        bodyPreview: 'Apple Support Time Machine results',
        bodyTextLength: 300
      },
      [{
        link: 'https://support.apple.com/en-us/104984',
        title: 'Back up your Mac with Time Machine - Apple Support',
        snippet: 'Use Time Machine to back up your Mac.'
      }]
    )).toMatchObject({ accepted: true, matchedResultCount: 1 })
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

  it('does not start a task with an already cancelled parent', async () => {
    const controller = new AbortController()
    controller.abort(new Error('cancelled'))
    const factory = vi.fn()
    await expect(_withTimeout(factory, 1000, 'timeout', controller.signal)).rejects.toThrow('cancelled')
    expect(factory).not.toHaveBeenCalled()
  })

  it('cancels a pending task immediately when its parent is aborted', async () => {
    const controller = new AbortController()
    let child!: AbortSignal
    const task = _withTimeout(signal => {
      child = signal
      return new Promise(() => {})
    }, 1000, 'timeout', controller.signal)
    await Promise.resolve()
    controller.abort(new Error('cancelled'))
    await expect(task).rejects.toThrow('cancelled')
    expect(child.aborted).toBe(true)
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
    } as ReturnType<typeof DatabaseService.getConfig>)
    expect(_resolveConfiguredFetchCounts(undefined)).toBe(_MAX_FETCH_COUNTS)
  })

  it('passes through a value within the cap unchanged', () => {
    expect(_resolveConfiguredFetchCounts(5)).toBe(5)
  })
})

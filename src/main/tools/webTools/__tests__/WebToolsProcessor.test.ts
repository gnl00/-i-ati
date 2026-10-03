import { mkdtemp, readFile, readdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
  applySearchAggregateInlineBudget,
  processWebFetch,
  processWebSearch,
  SearchArtifactBudget,
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
    vi.clearAllMocks()
    userDataDir = await mkdtemp(join(tmpdir(), 'ati-web-tools-'))
    mocks.getPath.mockReturnValue(userDataDir)
  })

  afterEach(async () => {
    await rm(userDataDir, { recursive: true, force: true })
  })

  it.each([
    { body: 'Useful example content. '.repeat(20), status: 'fetched', success: true },
    { body: '', status: 'failed', success: false },
    { body: '<html><title>Access denied</title><body>Request blocked.</body></html>', status: 'blocked', success: false }
  ])('distinguishes $status content while retaining search metadata', async ({ body, status, success }) => {
    const link = 'https://example.com/article.txt'
    mocks.acquireSearchWindow.mockResolvedValueOnce(createSearchWindow(normalBingSnapshot, [
      { link, title: 'Example article', snippet: 'Example search snippet' }
    ]))
    mocks.netFetch.mockResolvedValueOnce(new Response(body, { headers: { 'content-type': 'text/html' } }))
    const result = await processWebSearch({ query: 'example' })
    expect(result.success).toBe(true)
    expect(result.results[0]).toMatchObject({
      link, snippet: 'Example search snippet', contentStatus: status, success
    })
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
    mocks.netFetch.mockImplementation(async () => new Response('Useful backup content. '.repeat(20), {
      headers: { 'content-type': 'text/plain' }
    }))
    const result = await processWebSearch({ query: 'Apple Time Machine backup', fetchCounts: 2 })
    expect(result.results.map(item => item.link)).toEqual([links[1], links[3]])
    expect(mocks.netFetch.mock.calls.map(call => call[0]).sort()).toEqual([links[1], links[3]].sort())
  })

  it('marks snippets as not requested without fetching content', async () => {
    mocks.acquireSearchWindow.mockResolvedValueOnce(createSearchWindow(normalBingSnapshot, [
      { link: 'https://example.com/article', title: 'Example article', snippet: 'Example search snippet' }
    ]))
    const result = await processWebSearch({ query: 'example', snippetsOnly: true })
    expect(result.results[0]).toMatchObject({ success: true, contentStatus: 'not_requested', content: '' })
    expect(mocks.netFetch).not.toHaveBeenCalled()
  })

  it.each([
    { html: '<body></body>', title: 'Empty page', error: 'WEB_FETCH_EMPTY_CONTENT' },
    { html: '<body>Request blocked.</body>', title: 'Access denied', error: 'WEB_FETCH_BLOCKED_PAGE' }
  ])('rejects $error after rendered extraction and returns the window', async ({ html, title, error }) => {
    const url = 'https://example.com/rendered-page'
    mocks.netFetch.mockResolvedValueOnce(new Response('short direct content', {
      headers: { 'content-type': 'text/plain' }
    }))
    const window = {
      loadURL: vi.fn(async () => {}),
      isDestroyed: vi.fn(() => false),
    destroy: vi.fn(),
      webContents: {
        stop: vi.fn(), getURL: vi.fn(() => url),
        executeJavaScript: vi.fn(async (script: string) => script.includes('html:')
          ? { html, title, finalUrl: url }
          : 100)
      }
    }
    mocks.acquireContentWindow.mockResolvedValueOnce(window)
    expect(await processWebFetch({ url })).toMatchObject({ success: false, error })
    expect(mocks.releaseContentWindow).toHaveBeenCalledWith(window)
  })

  it('retires an active rendered window when the run is cancelled and returns its permit', async () => {
    const controller = new AbortController()
    const url = 'https://example.com/rendered-page'
    mocks.netFetch.mockResolvedValueOnce(new Response('short direct content'))
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
      webContents: { stop: vi.fn() }
    }
    mocks.acquireContentWindow.mockResolvedValueOnce(window)
    const fetching = processWebFetch({ url }, { signal: controller.signal })
    await ready
    controller.abort(new Error('Run stopped'))
    expect(await fetching).toMatchObject({ success: false, error: 'Run stopped' })
    await vi.waitFor(() => expect(mocks.releaseContentWindow).toHaveBeenCalledWith(window))
    expect(window.destroy).toHaveBeenCalledTimes(1)
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
    const fetching = processWebFetch({ url: 'https://example.com/article' }, { signal: controller.signal })
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
      url: 'https://example.com/download',
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
      const result = processWebSearch({ query: 'Time Machine', snippetsOnly: true })
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
      snippetsOnly: true
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
      snippetsOnly: true
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
      snippetsOnly: true
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

describe('web search budgets', () => {
  it('reserves artifact capacity in result order and releases failed reservations', async () => {
    const budget = new SearchArtifactBudget()
    let secondSettled = false
    const second = budget.reserve(1, 1).then(value => {
      secondSettled = true
      return value
    })
    await Promise.resolve()
    expect(secondSettled).toBe(false)
    budget.complete(0)
    const reservation = await second
    expect(reservation).toBeDefined()
    reservation!.release()
  })

  it('cancels an ordered artifact reservation while it waits for an earlier result', async () => {
    const budget = new SearchArtifactBudget()
    const controller = new AbortController()
    const pending = budget.reserve(1, 1, controller.signal)
    controller.abort()
    await expect(pending).rejects.toThrow('aborted while waiting for artifact budget')
    budget.complete(0)
  })

  it('degrades only the aggregate-overflow result when artifact promotion is exhausted', async () => {
    const results = [
      {
        query: 'q',
        success: true,
        link: 'https://example.com/1',
        title: 'one',
        snippet: 'one snippet',
        content: 'a'.repeat(96_000)
      },
      {
        query: 'q',
        success: true,
        link: 'https://example.com/2',
        title: 'two',
        snippet: 'two snippet',
        content: 'b'
      }
    ]
    await applySearchAggregateInlineBudget(results, async () => {
      throw Object.assign(new Error('budget exhausted'), {
        code: 'WEB_SEARCH_ARTIFACT_BUDGET_EXCEEDED'
      })
    })
    expect(results[0].success).toBe(true)
    expect(results[1]).toMatchObject({
      success: false,
      link: 'https://example.com/2',
      title: 'two',
      snippet: 'two snippet',
      content: '',
      error: 'WEB_SEARCH_ARTIFACT_BUDGET_EXCEEDED'
    })
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
    } as any)
    expect(_resolveConfiguredFetchCounts(undefined)).toBe(_MAX_FETCH_COUNTS)
  })

  it('passes through a value within the cap unchanged', () => {
    expect(_resolveConfiguredFetchCounts(5)).toBe(5)
  })
})

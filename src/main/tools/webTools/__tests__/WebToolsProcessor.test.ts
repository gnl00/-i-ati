import { mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'fs/promises'
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
    }
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
    acquireContentWindow: mocks.acquireContentWindow,
    releaseContentWindow: mocks.releaseContentWindow
  }))
}))

import DatabaseService from '@main/db/DatabaseService'
import {
  applySearchAggregateInlineBudget,
  processWebFetch,
  SearchArtifactBudget,
  _withTimeout,
  _WEB_FETCH_TIMEOUT,
  _resolveConfiguredFetchCounts,
  _MAX_FETCH_COUNTS
} from '../WebToolsProcessor'
import { WorkspaceWebFetchArtifactService } from '../artifacts/WorkspaceWebFetchArtifactService'
import { createHash } from 'crypto'

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
    expect(await readFile(join(workspace, result.artifact!.readPath), 'utf-8')).toContain(
      'MIME: application/pdf'
    )
  })

  it('promotes an EZ3i-sized PDF to a bounded raw workspace artifact', async () => {
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
    expect(readable).toContain('# Downloaded web file')
    expect(readable).toContain('MIME: application/pdf')
    expect(await readdir(join(workspace, '.tmp', 'web-fetch'))).toEqual([])
  }, 15_000)

  it('promotes small extracted text when it exceeds the inline character budget', async () => {
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
    const readable = await readFile(
      join(userDataDir, 'workspaces', 'small-binary', result.artifact!.readPath),
      'utf-8'
    )
    expect(readable).toContain('Downloaded web file')
  })

  it('cleans stale spool files and keeps current partial downloads', async () => {
    const workspace = join(userDataDir, 'workspaces', 'stale-chat')
    const spoolDirectory = join(workspace, '.tmp', 'web-fetch')
    await mkdir(spoolDirectory, { recursive: true })
    const stale = join(spoolDirectory, 'stale.part')
    const current = join(spoolDirectory, 'current.part')
    const staleStaging = join(spoolDirectory, '.staging-old')
    await writeFile(stale, 'stale')
    await writeFile(current, 'current')
    await mkdir(staleStaging)
    await writeFile(join(staleStaging, 'source.bin'), 'stale')
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000)
    await utimes(stale, old, old)
    await utimes(staleStaging, old, old)

    const service = new WorkspaceWebFetchArtifactService('stale-chat')
    expect(await service.cleanupStalePartFiles()).toBe(2)
    expect(await readdir(spoolDirectory)).toEqual(['current.part'])
  })

  it('reuses one atomically published artifact for concurrent identical sources', async () => {
    const service = new WorkspaceWebFetchArtifactService('same-sha')
    const content = new TextEncoder().encode('shared source')
    const sha256 = createHash('sha256').update(content).digest('hex')
    const first = await service.allocateSpool()
    const second = await service.allocateSpool()
    await service.writeSpool(first, content)
    await service.writeSpool(second, content)
    const promote = (
      spool: typeof first,
      summary: string
    ): ReturnType<WorkspaceWebFetchArtifactService['promote']> => service.promote({
      spool,
      requestedUrl: 'https://example.com/shared.txt',
      finalUrl: 'https://example.com/shared.txt',
      contentType: 'text/plain',
      sizeBytes: content.length,
      sha256,
      readableContent: 'shared source',
      summary
    })
    const [firstArtifact, secondArtifact] = await Promise.all([
      promote(first, 'first'),
      promote(second, 'second')
    ])
    expect(secondArtifact.readPath).toBe(firstArtifact.readPath)
    expect(secondArtifact.sourcePath).toBe(firstArtifact.sourcePath)
    expect(secondArtifact.summary).toBe(firstArtifact.summary)
    const spoolEntries = await readdir(
      join(userDataDir, 'workspaces', 'same-sha', '.tmp', 'web-fetch')
    )
    expect(spoolEntries).toEqual([])
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

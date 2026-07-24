import { createHash } from 'crypto'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@main/logging/LogService', () => ({
  createLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
}))

import { Semaphore } from '../util/Semaphore'
import { waitForCondition } from '../util/waitForCondition'
import { downloadViaHttp } from '../http/HttpFetcher'
import { WEB_FETCH_DOWNLOAD_MAX_BYTES } from '../artifacts/constants'
import { postCleanLite, postCleanFull } from '../extract/postClean'
import { extractMainHtml } from '../extract/ContentExtractor'
import { bingSearchEngine } from '../search-engine/bing'

// 构造带 ReadableStream body 的 Response mock（避免依赖真实 fetch）
function makeStreamResponse(chunks: Uint8Array[], headers = new Headers()): Response {
  let i = 0
  const reader = {
    read: async (): Promise<{ done: boolean; value?: Uint8Array }> => {
      if (i < chunks.length) return { done: false, value: chunks[i++] }
      return { done: true, value: undefined }
    },
    cancel: async (): Promise<void> => {}
  }
  return {
    body: { getReader: () => reader },
    headers,
    ok: true,
    status: 200,
    url: 'https://example.com/final'
  } as unknown as Response
}

// 构造 body-less（无 getReader）的 Response mock
function makeBodylessResponse(bytes: Uint8Array, contentLength?: number): Response {
  const headers = new Headers()
  if (contentLength !== undefined) headers.set('content-length', String(contentLength))
  return {
    body: null,
    headers,
    arrayBuffer: async (): Promise<ArrayBuffer> => bytes.buffer.slice(0) as ArrayBuffer,
    ok: true,
    status: 200,
    url: 'https://example.com/final'
  } as unknown as Response
}

describe('Semaphore', () => {
  it('limits concurrency to its capacity and queues the rest', async () => {
    const sem = new Semaphore(2)
    await sem.acquire()
    await sem.acquire()
    expect(sem.available).toBe(0)

    let third = false
    const p = sem.acquire().then(() => {
      third = true
    })
    await Promise.resolve()
    expect(third).toBe(false) // 队列中，未放行
    expect(sem.pending).toBe(1)

    sem.release()
    await p
    expect(third).toBe(true)
  })

  it('hands the permit to the first waiter (FIFO), not back to the pool', async () => {
    const sem = new Semaphore(1)
    await sem.acquire()
    const order: number[] = []
    const a = sem.acquire().then(() => order.push(1))
    const b = sem.acquire().then(() => order.push(2))
    sem.release()
    await a
    sem.release()
    await b
    expect(order).toEqual([1, 2])
  })

  it('caps peak concurrency at capacity for a burst of tasks and returns to full with no leak', async () => {
    const sem = new Semaphore(6)
    let inFlight = 0
    let peak = 0
    const releasers: Array<() => void> = []

    const runTask = async (fail: boolean): Promise<void> => {
      await sem.acquire()
      try {
        inFlight++
        peak = Math.max(peak, inFlight)
        // 受控 task：挂起直到测试放行
        await new Promise<void>((resolve, reject) => {
          releasers.push(fail ? () => reject(new Error('boom')) : resolve)
        })
      } finally {
        inFlight--
        sem.release()
      }
    }

    // 12 个并发任务，其中第 3 个 reject，验证峰值 <= 6 且失败也不泄漏 permit
    const tasks = Array.from({ length: 12 }, (_, i) => runTask(i === 2).catch(() => {}))
    // 让前 6 个 acquire 到 permit
    await Promise.resolve()
    await Promise.resolve()
    expect(peak).toBeLessThanOrEqual(6)
    expect(sem.available).toBe(0)

    // 逐个放行，permit 过户给排队者，峰值始终不超过 6
    while (releasers.length > 0) {
      const next = releasers.shift()!
      next()
      await Promise.resolve()
      await Promise.resolve()
    }
    await Promise.all(tasks)

    expect(peak).toBeLessThanOrEqual(6)
    expect(sem.available).toBe(6) // 全部归还，无泄漏
    expect(sem.pending).toBe(0)
  })
})

describe('waitForCondition', () => {
  it('does not re-enter checkFn while a slow check is in flight', async () => {
    let inFlight = 0
    let maxConcurrent = 0
    let calls = 0
    await waitForCondition(
      async () => {
        inFlight++
        maxConcurrent = Math.max(maxConcurrent, inFlight)
        await new Promise(r => setTimeout(r, 30))
        inFlight--
        calls++
        return calls >= 3
      },
      2000,
      1 // interval 远小于 checkFn 耗时，旧的 setInterval 实现会重入
    )
    expect(maxConcurrent).toBe(1)
  })

  it('rejects on timeout', async () => {
    await expect(waitForCondition(async () => false, 50, 10)).rejects.toThrow(/Timeout/)
  })

  describe('hard timeout guard (fake timers)', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('rejects via the independent hard timer even when checkFn never resolves', async () => {
      vi.useFakeTimers()
      const neverResolves = (): Promise<boolean> => new Promise(() => {})

      const promise = waitForCondition(neverResolves, 1000, 100)
      const assertion = expect(promise).rejects.toThrow('Timeout waiting for condition')

      await vi.advanceTimersByTimeAsync(1000)
      await assertion
    })

    it('does not re-enter and resolves exactly on the 3rd successful check', async () => {
      vi.useFakeTimers()
      let calls = 0
      const checkFn = vi.fn(async () => {
        calls++
        return calls >= 3
      })

      const promise = waitForCondition(checkFn, 5000, 50)
      await vi.advanceTimersByTimeAsync(200)
      await promise

      expect(calls).toBe(3)
      expect(checkFn).toHaveBeenCalledTimes(3)
    })

    it('rejects with the thrown error when checkFn throws', async () => {
      vi.useFakeTimers()
      const boom = new Error('boom')
      const promise = waitForCondition(async () => {
        throw boom
      }, 1000, 50)

      const assertion = expect(promise).rejects.toBe(boom)
      await vi.advanceTimersByTimeAsync(0)
      await assertion
    })

    it('settles only once when the hard timer fires before a slow checkFn resolves(true)', async () => {
      vi.useFakeTimers()
      let resolveCheck: (v: boolean) => void = () => {}
      const slowCheck = (): Promise<boolean> =>
        new Promise(resolve => {
          resolveCheck = resolve
        })

      const promise = waitForCondition(slowCheck, 100, 1000)
      const assertion = expect(promise).rejects.toThrow('Timeout waiting for condition')

      await vi.advanceTimersByTimeAsync(100)
      // checkFn 在硬超时之后才 resolve(true)，不应改变已经 reject 的结果
      resolveCheck(true)
      await assertion
    })

    it('rejects immediately without calling checkFn when the signal is already aborted', async () => {
      const controller = new AbortController()
      controller.abort()
      const checkFn = vi.fn(async () => true)

      await expect(waitForCondition(checkFn, 1000, 10, controller.signal)).rejects.toThrow(
        'Aborted waiting for condition'
      )
      expect(checkFn).not.toHaveBeenCalled()
    })
  })
})

describe('downloadViaHttp', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('streams the complete response to the supplied spool and returns byte/hash facts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ati-http-spool-'))
    const path = join(root, 'response.part')
    await writeFile(path, '')
    const chunks = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])]
    const headers = new Headers({ 'content-type': 'application/octet-stream', 'content-length': '999' })
    vi.stubGlobal('fetch', vi.fn(async () => makeStreamResponse(chunks, headers)))
    const result = await downloadViaHttp('https://example.com/requested', 'agent', {
      absolutePath: path,
      relativePath: '.tmp/web-fetch/response.part'
    })
    expect(Array.from(await readFile(path))).toEqual([1, 2, 3, 4, 5])
    expect(result).toMatchObject({
      requestedUrl: 'https://example.com/requested',
      finalUrl: 'https://example.com/final',
      declaredContentLength: 999,
      receivedBytes: 5,
      sha256: createHash('sha256').update(new Uint8Array([1, 2, 3, 4, 5])).digest('hex')
    })
    await rm(root, { recursive: true, force: true })
  })

  it.each([
    ['missing', undefined],
    ['invalid', 'unknown']
  ])('keeps %s Content-Length diagnostic undefined', async (_label, contentLength) => {
    const root = await mkdtemp(join(tmpdir(), 'ati-http-length-'))
    const path = join(root, 'response.part')
    await writeFile(path, '')
    const headers = new Headers()
    if (contentLength !== undefined) headers.set('content-length', contentLength)
    vi.stubGlobal('fetch', vi.fn(async () => makeStreamResponse([new Uint8Array([1])], headers)))
    const result = await downloadViaHttp('https://example.com/length', 'agent', {
      absolutePath: path,
      relativePath: '.tmp/web-fetch/response.part'
    })
    expect(result.declaredContentLength).toBeUndefined()
    await rm(root, { recursive: true, force: true })
  })

  it('uses received bytes for the hard limit and removes an oversized spool', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ati-http-cap-'))
    const path = join(root, 'response.part')
    await writeFile(path, '')
    const oneMiB = new Uint8Array(1024 * 1024)
    vi.stubGlobal('fetch', vi.fn(async () => makeStreamResponse(
      Array.from({ length: 51 }, () => oneMiB),
      new Headers({ 'content-length': '1' })
    )))
    await expect(downloadViaHttp('https://example.com/large', 'agent', {
      absolutePath: path,
      relativePath: '.tmp/web-fetch/response.part'
    })).rejects.toThrow('WEB_FETCH_DOWNLOAD_TOO_LARGE')
    await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(WEB_FETCH_DOWNLOAD_MAX_BYTES).toBe(50 * 1024 * 1024)
    await rm(root, { recursive: true, force: true })
  })

  it('rejects a bodyless response from declared length before materializing its array buffer', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ati-http-bodyless-cap-'))
    const path = join(root, 'response.part')
    await writeFile(path, '')
    const response = makeBodylessResponse(new Uint8Array([1]), WEB_FETCH_DOWNLOAD_MAX_BYTES + 1)
    const arrayBuffer = vi.spyOn(response, 'arrayBuffer')
    vi.stubGlobal('fetch', vi.fn(async () => response))
    await expect(downloadViaHttp('https://example.com/bodyless-large', 'agent', {
      absolutePath: path,
      relativePath: '.tmp/web-fetch/response.part'
    })).rejects.toThrow('WEB_FETCH_DOWNLOAD_TOO_LARGE')
    expect(arrayBuffer).not.toHaveBeenCalled()
    await rm(root, { recursive: true, force: true })
  })

  it('throws and cancels the reader when the signal is already aborted', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ati-http-abort-'))
    const path = join(root, 'response.part')
    await writeFile(path, '')
    const cancel = vi.fn(async () => {})
    const read = vi.fn(async () => ({ done: false, value: new Uint8Array(4) }))
    const resp = {
      body: { getReader: () => ({ read, cancel }) },
      headers: new Headers(),
      ok: true,
      status: 200,
      url: 'https://example.com/final'
    } as unknown as Response
    vi.stubGlobal('fetch', vi.fn(async () => resp))
    const controller = new AbortController()
    controller.abort()

    await expect(downloadViaHttp('https://example.com/abort', 'agent', {
      absolutePath: path,
      relativePath: '.tmp/web-fetch/response.part'
    }, controller.signal)).rejects.toThrow('Fetch aborted')
    expect(read).not.toHaveBeenCalled()
    expect(cancel).toHaveBeenCalled()
    await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' })
    await rm(root, { recursive: true, force: true })
  })
})

describe('bing extraction script', () => {
  it('skips result links whose host is google.com or a subdomain', () => {
    const script = bingSearchEngine.buildExtractResultsScript(5)
    // 抽取脚本在页面上下文执行，应包含跳过 google.com 结果链接的 host 判断（回归 #6）
    expect(script).toContain("=== 'google.com'")
    expect(script).toContain(".endsWith('.google.com')")
  })
})

describe('postClean', () => {
  it('keeps short CJS lines (length <= 2) that the old length>2 filter dropped', () => {
    const out = postCleanLite('简介\n正文内容在这里')
    expect(out).toContain('简介')
  })

  it('does not truncate a body line that merely contains a noise keyword mid-sentence', () => {
    const out = postCleanLite('本文重点研究广告投放策略与转化率')
    expect(out).toBe('本文重点研究广告投放策略与转化率')
  })

  it('drops a line that starts with a noise keyword', () => {
    const out = postCleanLite('正文第一段\n关注我们的公众号获取更多')
    expect(out).toContain('正文第一段')
    expect(out).not.toContain('关注我们')
  })

  it('full mode drops empty lines but keeps every non-empty line', () => {
    const out = postCleanFull('a\n\n\nb\nc')
    expect(out).toBe('a\nb\nc')
  })
})

describe('extractMainHtml', () => {
  it('prefers the container with the most text over an empty semantic shell', () => {
    const html = `
      <html><body>
        <main></main>
        <article><p>${'这是正文段落。'.repeat(30)}</p></article>
      </body></html>`
    const { html: main } = extractMainHtml(html)
    expect(main).toContain('这是正文段落')
  })

  it('does not remove content whose class merely contains the substring "hot"', () => {
    const html = `
      <html><body>
        <div class="hotel-review"><p>${'酒店评测正文内容。'.repeat(30)}</p></div>
      </body></html>`
    const { html: main } = extractMainHtml(html)
    expect(main).toContain('酒店评测正文内容')
  })

  it('removes related/recommend blocks matched at word boundaries', () => {
    const html = `
      <html><body>
        <article><p>${'主要正文段落文字。'.repeat(30)}</p></article>
        <div class="related-posts"><p>相关推荐链接不应出现</p></div>
      </body></html>`
    const { html: main } = extractMainHtml(html)
    expect(main).toContain('主要正文段落文字')
    expect(main).not.toContain('相关推荐链接不应出现')
  })
})

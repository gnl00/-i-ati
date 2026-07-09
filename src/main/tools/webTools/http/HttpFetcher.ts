import { net } from 'electron'
import { createLogger } from '@main/logging/LogService'
import { extractCleanContent } from '../extract/ContentExtractor'
import { postClean, type CleanMode } from '../extract/postClean'

const logger = createLogger('HttpFetcher')

type FetchLike = typeof fetch
type HttpFetchTransport = 'electron-net-fetch' | 'node-fetch'

const MAX_BYTES = 5 * 1024 * 1024 // 5MB 响应体上限
const CHARSET_RE = /charset\s*=\s*["']?([\w-]+)/i
const META_CHARSET_RE = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i

// 常见 charset 别名 → TextDecoder 可识别的 label
const CHARSET_ALIAS: Record<string, string> = {
  'gb2312': 'gbk',
  'gb-2312': 'gbk',
  'x-gbk': 'gbk',
  'ms936': 'gbk'
}

export interface HttpFetchResult {
  pageTitle: string
  finalUrl: string
  extractedText: string
}

function resolveDefaultHttpFetch(): { fetchImpl: FetchLike; transport: HttpFetchTransport } {
  if (typeof net?.fetch === 'function') {
    return { fetchImpl: net.fetch.bind(net) as FetchLike, transport: 'electron-net-fetch' }
  }
  return { fetchImpl: fetch, transport: 'node-fetch' }
}

function getErrorCauseDetails(error: unknown): Record<string, unknown> {
  const cause = (error as { cause?: unknown } | undefined)?.cause
  if (!cause || typeof cause !== 'object') return {}
  const c = cause as Record<string, unknown>
  return {
    causeName: c.name,
    causeMessage: c.message,
    causeCode: c.code,
    causeErrno: c.errno,
    causeSyscall: c.syscall,
    causeHostname: c.hostname
  }
}

function getFallbackTitleFromUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const filename = (parsed.pathname || '').split('/').pop() || ''
    return decodeURIComponent(filename) || parsed.hostname
  } catch {
    return ''
  }
}

function makeDecoder(charset?: string): TextDecoder {
  const norm = (charset || 'utf-8').toLowerCase().trim()
  const label = CHARSET_ALIAS[norm] ?? norm
  try {
    return new TextDecoder(label, { fatal: false })
  } catch {
    return new TextDecoder('utf-8', { fatal: false })
  }
}

/**
 * 流式读取响应体，累计到上限即掐断连接，避免超大页面全量进内存。
 *
 * 存入前按剩余额度裁剪并用 slice() 拷贝（而非 subarray 视图，后者会保留整个源
 * buffer），峰值内存严格 <= max。body-less 响应无法流式读取：content-length
 * 超限直接拒绝，否则弱保护（warn + arrayBuffer 后裁剪）。
 */
export async function readCapped(
  response: Response,
  max: number,
  signal?: AbortSignal
): Promise<Uint8Array> {
  const body = response.body as ReadableStream<Uint8Array> | null
  if (!body || typeof body.getReader !== 'function') {
    const declared = Number(response.headers.get('content-length') || 0)
    if (declared > max) {
      throw new Error(`Response too large: content-length ${declared} > cap ${max}`)
    }
    logger.warn('web_fetch.readcapped_bodyless_weak_protection', { declared })
    const buf = new Uint8Array(await response.arrayBuffer())
    return buf.length > max ? buf.slice(0, max) : buf
  }

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (total < max) {
      // abort 时抛出而非返回已读部分：与上层「abort=失败」语义一致，避免把被取消
      // 的抓取当成一个内容偏短但「成功」的页面返回。finally 的 reader.cancel 仍会执行。
      if (signal?.aborted) throw new Error('Fetch aborted')
      const { done, value } = await reader.read()
      if (done) break
      if (!value || value.length === 0) continue
      const remaining = max - total
      // 存入前裁剪并拷贝：piece 独立于源 buffer，不残留整块视图
      const piece = value.length > remaining ? value.slice(0, remaining) : value
      chunks.push(piece)
      total += piece.length
    }
  } finally {
    reader.cancel().catch(() => {})
  }

  if (chunks.length === 1) return chunks[0]
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

/**
 * 直连 HTTP 抓取：带 charset 探测（header → <meta> → utf-8）与响应体大小防护。
 * 返回结构与旧 fetchPageContentViaHttp 一致。
 */
export async function fetchViaHttp(
  url: string,
  mode: CleanMode,
  userAgent: string,
  signal?: AbortSignal
): Promise<HttpFetchResult> {
  const { fetchImpl, transport } = resolveDefaultHttpFetch()
  let response: Response

  try {
    response = await fetchImpl(url, {
      redirect: 'follow',
      signal,
      headers: {
        'User-Agent': userAgent,
        'Accept':
          'text/html, text/plain, text/markdown, application/xhtml+xml, application/xml;q=0.9, */*;q=0.8'
      }
    })
  } catch (error: any) {
    logger.warn('web_fetch.direct_http_request_failed', {
      url,
      transport,
      name: error?.name,
      message: error?.message || String(error),
      ...getErrorCauseDetails(error)
    })
    throw error
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch page: HTTP ${response.status}`)
  }

  const finalUrl = response.url || url
  const contentType = (response.headers.get('content-type') || '').toLowerCase()
  const declaredLength = Number(response.headers.get('content-length') || 0)
  if (declaredLength && declaredLength > MAX_BYTES) {
    logger.warn('web_fetch.direct_http_response_truncated', { url: finalUrl, declaredLength, cap: MAX_BYTES })
  }

  const raw = await readCapped(response, MAX_BYTES, signal)

  // charset 判定：header 优先 → 前 2KB 嗅探 <meta>（meta 是 ASCII 子集，用 utf-8 试解安全）→ utf-8
  let charset = CHARSET_RE.exec(contentType)?.[1]
  if (!charset) {
    const head = new TextDecoder('utf-8', { fatal: false }).decode(raw.subarray(0, 2048))
    charset = CHARSET_RE.exec(head)?.[1] ?? META_CHARSET_RE.exec(head)?.[1]
  }
  const bodyText = makeDecoder(charset).decode(raw)
  const fallbackTitle = getFallbackTitleFromUrl(finalUrl)

  const looksHtml =
    contentType.includes('html') || bodyText.includes('<html') || bodyText.includes('<body')

  if (looksHtml) {
    const { title, text } = extractCleanContent(bodyText, mode, fallbackTitle)
    return { pageTitle: title, finalUrl, extractedText: text }
  }

  return {
    pageTitle: fallbackTitle,
    finalUrl,
    extractedText: postClean(bodyText, mode)
  }
}

import { createHash } from 'crypto'
import { open, rm } from 'fs/promises'
import { net } from 'electron'
import { createLogger } from '@main/logging/LogService'
import type { WebFetchSpoolFile } from '../artifacts/WorkspaceWebFetchArtifactService'
import { WEB_FETCH_DOWNLOAD_MAX_BYTES } from '../artifacts/constants'

const logger = createLogger('HttpFetcher')

type FetchLike = typeof fetch
type HttpFetchTransport = 'electron-net-fetch' | 'node-fetch'

export interface DownloadedHttpResponse {
  requestedUrl: string
  finalUrl: string
  contentType: string
  declaredContentLength?: number
  receivedBytes: number
  sha256: string
  tempAbsolutePath: string
  tempRelativePath: string
}

export class WebFetchDownloadTooLargeError extends Error {
  readonly code = 'WEB_FETCH_DOWNLOAD_TOO_LARGE'

  constructor(public readonly receivedBytes: number) {
    super(`WEB_FETCH_DOWNLOAD_TOO_LARGE: response exceeded ${WEB_FETCH_DOWNLOAD_MAX_BYTES} bytes after receiving ${receivedBytes} bytes`)
    this.name = 'WebFetchDownloadTooLargeError'
  }
}

function resolveDefaultHttpFetch(): { fetchImpl: FetchLike, transport: HttpFetchTransport } {
  if (typeof net?.fetch === 'function') {
    return { fetchImpl: net.fetch.bind(net) as FetchLike, transport: 'electron-net-fetch' }
  }
  return { fetchImpl: fetch, transport: 'node-fetch' }
}

function getErrorCauseDetails(error: unknown): Record<string, unknown> {
  const cause = (error as { cause?: unknown } | undefined)?.cause
  if (!cause || typeof cause !== 'object') return {}
  const value = cause as Record<string, unknown>
  return {
    causeName: value.name,
    causeMessage: value.message,
    causeCode: value.code,
    causeErrno: value.errno,
    causeSyscall: value.syscall,
    causeHostname: value.hostname
  }
}

function declaredLength(response: Response): number | undefined {
  const raw = response.headers.get('content-length')
  if (raw === null || raw.trim() === '') return undefined
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : undefined
}

async function writeResponseBody(
  response: Response,
  spool: WebFetchSpoolFile,
  signal?: AbortSignal
): Promise<{ receivedBytes: number, sha256: string }> {
  const handle = await open(spool.absolutePath, 'w')
  const hash = createHash('sha256')
  let receivedBytes = 0
  const body = response.body as ReadableStream<Uint8Array> | null
  const reader = body?.getReader()

  try {
    if (!reader) {
      const declared = declaredLength(response)
      if (declared !== undefined && declared > WEB_FETCH_DOWNLOAD_MAX_BYTES) {
        throw new WebFetchDownloadTooLargeError(declared)
      }
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.length > WEB_FETCH_DOWNLOAD_MAX_BYTES) {
        throw new WebFetchDownloadTooLargeError(bytes.length)
      }
      await handle.write(bytes)
      hash.update(bytes)
      receivedBytes = bytes.length
    } else {
      for (;;) {
        if (signal?.aborted) throw new Error('Fetch aborted')
        const { done, value } = await reader.read()
        if (done) break
        if (!value?.length) continue
        receivedBytes += value.length
        if (receivedBytes > WEB_FETCH_DOWNLOAD_MAX_BYTES) {
          throw new WebFetchDownloadTooLargeError(receivedBytes)
        }
        await handle.write(value)
        hash.update(value)
      }
    }
  } finally {
    await reader?.cancel().catch(() => {})
    await handle.close()
  }

  return { receivedBytes, sha256: hash.digest('hex') }
}

export async function downloadViaHttp(
  url: string,
  userAgent: string,
  spool: WebFetchSpoolFile,
  signal?: AbortSignal
): Promise<DownloadedHttpResponse> {
  const { fetchImpl, transport } = resolveDefaultHttpFetch()
  let response: Response
  const cleanupOnAbort = (): void => {
    void rm(spool.absolutePath, { force: true })
  }
  signal?.addEventListener('abort', cleanupOnAbort, { once: true })

  try {
    response = await fetchImpl(url, {
      redirect: 'follow',
      signal,
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/html, text/plain, text/markdown, application/xhtml+xml, application/xml;q=0.9, */*;q=0.8'
      }
    })
  } catch (error: unknown) {
    const errorValue = error as { name?: string, message?: string } | undefined
    await rm(spool.absolutePath, { force: true })
    logger.warn('web_fetch.direct_http_request_failed', {
      url,
      transport,
      name: errorValue?.name,
      message: errorValue?.message || String(error),
      ...getErrorCauseDetails(error)
    })
    throw error
  } finally {
    signal?.removeEventListener('abort', cleanupOnAbort)
  }

  if (!response.ok) {
    await rm(spool.absolutePath, { force: true })
    throw new Error(`Failed to fetch page: HTTP ${response.status}`)
  }

  try {
    const facts = await writeResponseBody(response, spool, signal)
    const result: DownloadedHttpResponse = {
      requestedUrl: url,
      finalUrl: response.url || url,
      contentType: (response.headers.get('content-type') || '').toLowerCase(),
      declaredContentLength: declaredLength(response),
      receivedBytes: facts.receivedBytes,
      sha256: facts.sha256,
      tempAbsolutePath: spool.absolutePath,
      tempRelativePath: spool.relativePath
    }
    logger.info('web_fetch.spool.completed', {
      url: result.finalUrl,
      receivedBytes: result.receivedBytes,
      declaredContentLength: result.declaredContentLength,
      tempPath: result.tempRelativePath
    })
    return result
  } catch (error) {
    await rm(spool.absolutePath, { force: true })
    if (error instanceof WebFetchDownloadTooLargeError) {
      logger.warn('web_fetch.download_too_large', { url, receivedBytes: error.receivedBytes })
    } else {
      logger.warn('web_fetch.spool.failed', { url, message: error instanceof Error ? error.message : String(error) })
    }
    throw error
  }
}

import { createHash } from 'crypto'
import { readFile } from 'fs/promises'
import { lookup as lookupMimeType } from 'mime-types'
import { extractCleanContent } from '../extract/ContentExtractor'
import { postClean, type CleanMode } from '../extract/postClean'
import type { DownloadedHttpResponse } from '../http/HttpFetcher'
import type { WebFetchArtifact } from '@tools/webTools/index.d'
import { createLogger } from '@main/logging/LogService'
import {
  WEB_FETCH_ARTIFACT_THRESHOLD_BYTES,
  WEB_FETCH_SUMMARY_MAX_CHARACTERS
} from './constants'
import {
  WorkspaceWebFetchArtifactService,
  type WebFetchSpoolFile
} from './WorkspaceWebFetchArtifactService'

const logger = createLogger('WebFetchContentMaterializer')
const CHARSET_RE = /charset\s*=\s*["']?([\w-]+)/i
const META_CHARSET_RE = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i
const CHARSET_ALIAS: Record<string, string> = {
  gb2312: 'gbk',
  'gb-2312': 'gbk',
  'x-gbk': 'gbk',
  ms936: 'gbk'
}

export interface MaterializedWebContent {
  pageTitle: string
  finalUrl: string
  extractedText: string
  artifact?: WebFetchArtifact
}

export interface ArtifactBudgetReservation {
  commit(): void
  release(): void
}

export class WebFetchArtifactBudgetExceededError extends Error {
  readonly code = 'WEB_SEARCH_ARTIFACT_BUDGET_EXCEEDED'

  constructor() {
    super('WEB_SEARCH_ARTIFACT_BUDGET_EXCEEDED')
    this.name = 'WebFetchArtifactBudgetExceededError'
  }
}

function fallbackTitle(url: string): string {
  try {
    const parsed = new URL(url)
    return decodeURIComponent(parsed.pathname.split('/').pop() || '') || parsed.hostname
  } catch {
    return ''
  }
}

function makeDecoder(charset?: string): TextDecoder {
  const normalized = (charset || 'utf-8').toLowerCase().trim()
  try {
    return new TextDecoder(CHARSET_ALIAS[normalized] ?? normalized, { fatal: false })
  } catch {
    return new TextDecoder('utf-8', { fatal: false })
  }
}

function decodeSource(bytes: Uint8Array, contentType: string): string {
  let charset = CHARSET_RE.exec(contentType)?.[1]
  if (!charset) {
    const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, 2048))
    charset = CHARSET_RE.exec(head)?.[1] ?? META_CHARSET_RE.exec(head)?.[1]
  }
  return makeDecoder(charset).decode(bytes)
}

function resolveEffectiveContentType(response: DownloadedHttpResponse): string {
  const declared = response.contentType.trim().toLowerCase()
  const declaredMime = declared.split(';', 1)[0].trim()
  if (declaredMime && declaredMime !== 'application/octet-stream') return declared
  try {
    const inferred = lookupMimeType(new URL(response.finalUrl).pathname)
    return inferred ? String(inferred).toLowerCase() : declared
  } catch {
    return declared
  }
}

function looksTextual(bytes: Uint8Array, contentType: string): boolean {
  const normalized = contentType.split(';', 1)[0].trim().toLowerCase()
  if (
    normalized.startsWith('text/')
    || /(json|xml|yaml|javascript|markdown|html)/i.test(normalized)
  ) return true
  if (normalized && normalized !== 'application/octet-stream') return false
  const sample = bytes.subarray(0, Math.min(bytes.length, 4096))
  if (sample.length === 0) return true
  let controls = 0
  for (const byte of sample) {
    if (byte === 0) return false
    if (byte < 9 || (byte > 13 && byte < 32)) controls++
  }
  return controls / sample.length < 0.05
}

function extractText(
  bytes: Uint8Array,
  contentType: string,
  mode: CleanMode,
  title: string
): { title: string, text: string } {
  const bodyText = decodeSource(bytes, contentType)
  const looksHtml = contentType.includes('html')
    || bodyText.includes('<html')
    || bodyText.includes('<body')
  return looksHtml
    ? extractCleanContent(bodyText, mode, title)
    : { title, text: postClean(bodyText, mode) }
}

function wrapLongLines(value: string, max = 4000): string {
  return value.split('\n').flatMap(line => {
    if (line.length <= max) return [line]
    const pieces: string[] = []
    for (let offset = 0; offset < line.length; offset += max) {
      pieces.push(line.slice(offset, offset + max))
    }
    return pieces
  }).join('\n')
}

function createSummary(readable: string): string {
  return readable.replace(/\s+/g, ' ').trim().slice(0, WEB_FETCH_SUMMARY_MAX_CHARACTERS)
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('Fetch aborted during content materialization')
}

function descriptor(artifact: WebFetchArtifact): string {
  const lines = [
    'Response saved to workspace.',
    `Source file: ${artifact.sourcePath}`,
    `Readable note: ${artifact.readPath}`,
    `Size: ${artifact.sizeBytes} bytes`
  ]
  if (artifact.mimeType) lines.push(`MIME: ${artifact.mimeType}`)
  lines.push(`Summary: ${artifact.summary}`)
  lines.push('')
  lines.push('Inspect the source file with a suitable workspace file-reading tool.')
  lines.push(`Use read with file_path="${artifact.readPath}", start_line=1, end_line=200 for the bounded note.`)
  return lines.join('\n')
}

export class WebFetchContentMaterializer {
  constructor(
    private readonly artifactService: WorkspaceWebFetchArtifactService,
    private readonly reserveArtifact?: (
      sizeBytes: number,
      signal?: AbortSignal
    ) => Promise<ArtifactBudgetReservation | undefined>
  ) {}

  async materialize(
    response: DownloadedHttpResponse,
    mode: CleanMode,
    inlineMaxCharacters: number,
    signal?: AbortSignal
  ): Promise<MaterializedWebContent> {
    throwIfAborted(signal)
    const spool: WebFetchSpoolFile = {
      absolutePath: response.tempAbsolutePath,
      relativePath: response.tempRelativePath
    }
    const sizeBytes = await this.artifactService.completedSize(spool)
    const bytes = new Uint8Array(await readFile(spool.absolutePath, { signal }))
    throwIfAborted(signal)
    const title = fallbackTitle(response.finalUrl)
    const effectiveResponse = {
      ...response,
      contentType: resolveEffectiveContentType(response)
    }

    if (
      sizeBytes <= WEB_FETCH_ARTIFACT_THRESHOLD_BYTES
      && looksTextual(bytes, effectiveResponse.contentType)
    ) {
      const extracted = extractText(bytes, effectiveResponse.contentType, mode, title)
      if (extracted.text.length <= inlineMaxCharacters) {
        await this.artifactService.cleanupSpool(spool)
        logger.info('web_fetch.inline.materialized', {
          url: response.finalUrl,
          sizeBytes,
          extractedCharacters: extracted.text.length
        })
        return {
          pageTitle: extracted.title || title,
          finalUrl: response.finalUrl,
          extractedText: extracted.text
        }
      }
      const artifactContent = mode === 'full'
        ? extracted
        : extractText(bytes, effectiveResponse.contentType, 'full', title)
      return this.promote(
        effectiveResponse,
        spool,
        sizeBytes,
        wrapLongLines(artifactContent.text),
        artifactContent.title || title,
        undefined,
        signal
      )
    }

    if (looksTextual(bytes, effectiveResponse.contentType)) {
      throwIfAborted(signal)
      const extracted = extractText(bytes, effectiveResponse.contentType, 'full', title)
      return this.promote(
        effectiveResponse,
        spool,
        sizeBytes,
        wrapLongLines(extracted.text),
        extracted.title || title,
        undefined,
        signal
      )
    }

    const mimeType = effectiveResponse.contentType || 'application/octet-stream'
    const diagnostic = [
      '# Downloaded web file',
      '',
      `Size: ${sizeBytes} bytes`,
      `MIME: ${mimeType}`,
      '',
      'The original source file is preserved in this workspace artifact.',
      'Inspect the source file with a suitable workspace file-reading tool.'
    ].join('\n')
    throwIfAborted(signal)
    return this.promote({
      ...effectiveResponse,
      contentType: mimeType
    }, spool, sizeBytes, diagnostic, title, 'Source file requires format-aware inspection', signal)
  }

  async materializeExtractedText(args: {
    pageTitle: string
    finalUrl: string
    extractedText: string
    inlineMaxCharacters: number
    signal?: AbortSignal
  }): Promise<MaterializedWebContent> {
    throwIfAborted(args.signal)
    if (args.extractedText.length <= args.inlineMaxCharacters) {
      return args
    }

    const spool = await this.artifactService.allocateSpool()
    try {
      const bytes = new TextEncoder().encode(args.extractedText)
      await this.artifactService.writeSpool(spool, bytes)
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      throwIfAborted(args.signal)
      return await this.promote({
        requestedUrl: args.finalUrl,
        finalUrl: args.finalUrl,
        contentType: 'text/markdown; charset=utf-8',
        receivedBytes: bytes.length,
        sha256,
        tempAbsolutePath: spool.absolutePath,
        tempRelativePath: spool.relativePath
      }, spool, bytes.length, wrapLongLines(args.extractedText), args.pageTitle, undefined, args.signal)
    } catch (error) {
      await this.artifactService.cleanupSpool(spool)
      throw error
    }
  }

  private async promote(
    response: DownloadedHttpResponse,
    spool: WebFetchSpoolFile,
    sizeBytes: number,
    readable: string,
    title: string,
    warning?: string,
    signal?: AbortSignal
  ): Promise<MaterializedWebContent> {
    throwIfAborted(signal)
    const reservation = this.reserveArtifact
      ? await this.reserveArtifact(sizeBytes, signal)
      : undefined
    if (this.reserveArtifact && !reservation) {
      await this.artifactService.cleanupSpool(spool)
      throw new WebFetchArtifactBudgetExceededError()
    }
    try {
      throwIfAborted(signal)
    } catch (error) {
      reservation?.release()
      throw error
    }
    const summary = createSummary(readable)
    let artifact: WebFetchArtifact
    try {
      artifact = await this.artifactService.promote({
        spool,
        requestedUrl: response.requestedUrl,
        finalUrl: response.finalUrl,
        contentType: response.contentType,
        declaredContentLength: response.declaredContentLength,
        sizeBytes,
        sha256: response.sha256,
        readableContent: readable,
        summary,
        extractionWarning: warning,
        signal
      })
      reservation?.commit()
    } catch (error) {
      reservation?.release()
      throw error
    }
    logger.info('web_fetch.artifact.materialized', {
      url: response.finalUrl,
      sizeBytes,
      extractedCharacters: readable.length
    })
    return {
      pageTitle: title,
      finalUrl: response.finalUrl,
      extractedText: descriptor(artifact),
      artifact
    }
  }
}

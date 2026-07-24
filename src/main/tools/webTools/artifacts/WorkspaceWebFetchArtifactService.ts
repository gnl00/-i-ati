import { randomUUID } from 'crypto'
import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'fs/promises'
import { basename, dirname, extname } from 'path'
import { createLogger } from '@main/logging/LogService'
import { resolveWorkspacePath } from '@main/services/filesystem/WorkspacePathResolver'
import type { WebFetchArtifact } from '@tools/webTools/index.d'
import { WEB_FETCH_PARTIAL_MAX_AGE_MS } from './constants'

const logger = createLogger('WorkspaceWebFetchArtifactService')

export interface WebFetchSpoolFile {
  absolutePath: string
  relativePath: string
}

export interface WebFetchArtifactMetadata {
  requestedUrl: string
  finalUrl: string
  contentType: string
  declaredContentLength?: number
  receivedBytes: number
  sha256: string
  extractedCharacters: number
  extractionStatus: 'complete' | 'diagnostic'
  extractionWarning?: string
  summary: string
}

export interface PromoteArtifactArgs {
  spool: WebFetchSpoolFile
  requestedUrl: string
  finalUrl: string
  contentType: string
  declaredContentLength?: number
  sizeBytes: number
  sha256: string
  readableContent: string
  summary: string
  extractionWarning?: string
  signal?: AbortSignal
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('Fetch aborted during artifact promotion')
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : undefined
}

function sanitizeFilename(value: string): string {
  const safe = value
    .replace(/[%]/g, '_')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
  return safe || 'download'
}

function sourceFilename(finalUrl: string, contentType: string): string {
  let urlName = ''
  try {
    urlName = decodeURIComponent(basename(new URL(finalUrl).pathname))
  } catch {
    urlName = ''
  }
  const sanitized = sanitizeFilename(urlName)
  const candidateExtension = extname(sanitized).toLowerCase()
  const safeExtensions = new Set([
    '.pdf', '.html', '.htm', '.json', '.md', '.markdown', '.txt',
    '.xml', '.yaml', '.yml', '.csv', '.log'
  ])
  let extension = safeExtensions.has(candidateExtension) ? candidateExtension : ''
  if (contentType.includes('pdf')) extension = '.pdf'
  else if (!extension && contentType.includes('html')) extension = '.html'
  else if (!extension && contentType.includes('json')) extension = '.json'
  else if (!extension && contentType.startsWith('text/')) extension = '.txt'
  else if (!extension) extension = '.bin'
  const stem = sanitizeFilename(
    candidateExtension && safeExtensions.has(candidateExtension)
      ? sanitized.slice(0, -candidateExtension.length)
      : sanitized
  )
  return `source-${stem}${extension}`
}

export class WorkspaceWebFetchArtifactService {
  constructor(private readonly chatUuid?: string) {}

  private resolve(relativePath: string, intent: 'existing' | 'creatable'): ReturnType<typeof resolveWorkspacePath> {
    return resolveWorkspacePath(relativePath, {
      chatUuid: this.chatUuid,
      mode: 'embedded-relative',
      intent
    })
  }

  async allocateSpool(): Promise<WebFetchSpoolFile> {
    const spool = this.resolve(`.tmp/web-fetch/${randomUUID()}.part`, 'creatable')
    await mkdir(dirname(spool.absolutePath), { recursive: true })
    const handle = await open(spool.absolutePath, 'wx')
    await handle.close()
    logger.info('web_fetch.spool.started', { path: spool.relativePath })
    return { absolutePath: spool.absolutePath, relativePath: spool.relativePath }
  }

  async cleanupSpool(spool: WebFetchSpoolFile): Promise<void> {
    await rm(spool.absolutePath, { force: true })
  }

  async completedSize(spool: WebFetchSpoolFile): Promise<number> {
    return (await stat(spool.absolutePath)).size
  }

  async readSpool(spool: WebFetchSpoolFile): Promise<Buffer> {
    return readFile(spool.absolutePath)
  }

  async writeSpool(spool: WebFetchSpoolFile, content: Uint8Array): Promise<void> {
    await writeFile(spool.absolutePath, content, { flag: 'w' })
  }

  async cleanupStalePartFiles(now = Date.now()): Promise<number> {
    const directory = this.resolve('.tmp/web-fetch', 'creatable')
    await mkdir(directory.absolutePath, { recursive: true })
    let removed = 0
    for (const entry of await readdir(directory.absolutePath, { withFileTypes: true })) {
      const isSpool = entry.isFile() && entry.name.endsWith('.part')
      const isStaging = entry.isDirectory() && entry.name.startsWith('.staging-')
      if (!isSpool && !isStaging) continue
      const candidate = this.resolve(`${directory.relativePath}/${entry.name}`, 'existing')
      const fileStat = await stat(candidate.absolutePath)
      if (now - fileStat.mtimeMs <= WEB_FETCH_PARTIAL_MAX_AGE_MS) continue
      await rm(candidate.absolutePath, { recursive: isStaging, force: true })
      removed++
    }
    logger.info('web_fetch.partial.cleanup_completed', { removed })
    return removed
  }

  async promote(args: PromoteArtifactArgs): Promise<WebFetchArtifact> {
    throwIfAborted(args.signal)
    const artifactRoot = `.ati/artifacts/web/${args.sha256.slice(0, 16)}`
    const artifactDirectory = this.resolve(artifactRoot, 'creatable')
    const stagingRoot = `.tmp/web-fetch/.staging-${randomUUID()}`
    const stagingDirectory = this.resolve(stagingRoot, 'creatable')
    await mkdir(stagingDirectory.absolutePath, { recursive: true })

    const sourceName = sourceFilename(args.finalUrl, args.contentType)
    const stagingSource = this.resolve(`${stagingRoot}/${sourceName}`, 'creatable')
    const stagingReadable = this.resolve(`${stagingRoot}/content.md`, 'creatable')
    const stagingMetadata = this.resolve(`${stagingRoot}/metadata.json`, 'creatable')
    let publishedSourceName = sourceName
    let effectiveSizeBytes = args.sizeBytes
    let effectiveSha256 = args.sha256
    let effectiveMimeType = args.contentType || undefined
    let effectiveSummary = args.summary

    try {
      await rename(args.spool.absolutePath, stagingSource.absolutePath)
      await writeFile(stagingReadable.absolutePath, args.readableContent, {
        encoding: 'utf-8',
        flag: 'wx',
        signal: args.signal
      })
      throwIfAborted(args.signal)
      const metadataValue: WebFetchArtifactMetadata = {
        requestedUrl: args.requestedUrl,
        finalUrl: args.finalUrl,
        contentType: args.contentType,
        declaredContentLength: args.declaredContentLength,
        receivedBytes: args.sizeBytes,
        sha256: args.sha256,
        extractedCharacters: args.readableContent.length,
        extractionStatus: args.extractionWarning ? 'diagnostic' : 'complete',
        extractionWarning: args.extractionWarning,
        summary: args.summary
      }
      await writeFile(stagingMetadata.absolutePath, `${JSON.stringify(metadataValue, null, 2)}\n`, {
        encoding: 'utf-8',
        flag: 'wx',
        signal: args.signal
      })
      throwIfAborted(args.signal)
      await mkdir(dirname(artifactDirectory.absolutePath), { recursive: true })
      try {
        await rename(stagingDirectory.absolutePath, artifactDirectory.absolutePath)
      } catch (error: unknown) {
        if (!['EEXIST', 'ENOTEMPTY', 'EPERM', 'EACCES'].includes(errorCode(error) ?? '')) {
          throw error
        }
        try {
          const existingEntries = await readdir(artifactDirectory.absolutePath)
          const existingSourceName = existingEntries.find(entry => entry.startsWith('source'))
          if (!existingSourceName) throw error
          const existingMetadataPath = this.resolve(`${artifactRoot}/metadata.json`, 'existing')
          const existingReadablePath = this.resolve(`${artifactRoot}/content.md`, 'existing')
          const existingSourcePath = this.resolve(`${artifactRoot}/${existingSourceName}`, 'existing')
          const existingMetadata = JSON.parse(
            await readFile(existingMetadataPath.absolutePath, 'utf-8')
          ) as Partial<WebFetchArtifactMetadata>
          const [existingReadableStat, existingSourceStat] = await Promise.all([
            stat(existingReadablePath.absolutePath),
            stat(existingSourcePath.absolutePath)
          ])
          if (
            existingMetadata.sha256 !== args.sha256
            || existingSourceStat.size !== args.sizeBytes
            || !existingReadableStat.isFile()
          ) throw error
          publishedSourceName = existingSourceName
          await rm(stagingDirectory.absolutePath, { recursive: true, force: true })
          effectiveSizeBytes = existingMetadata.receivedBytes ?? effectiveSizeBytes
          effectiveSha256 = existingMetadata.sha256 ?? effectiveSha256
          effectiveMimeType = existingMetadata.contentType || effectiveMimeType
          effectiveSummary = existingMetadata.summary
            ?? (await readFile(existingReadablePath.absolutePath, 'utf-8'))
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 2_000)
        } catch {
          throw error
        }
      }
    } catch (error) {
      await rm(stagingDirectory.absolutePath, { recursive: true, force: true })
      throw error
    }

    const sourcePath = `${artifactRoot}/${publishedSourceName}`
    const readPath = `${artifactRoot}/content.md`
    logger.info('web_fetch.artifact.promoted', {
      sourcePath,
      readPath,
      sizeBytes: effectiveSizeBytes
    })
    return {
      kind: 'workspace_artifact',
      sourcePath,
      readPath,
      sizeBytes: effectiveSizeBytes,
      sha256: effectiveSha256,
      mimeType: effectiveMimeType,
      summary: effectiveSummary
    }
  }
}

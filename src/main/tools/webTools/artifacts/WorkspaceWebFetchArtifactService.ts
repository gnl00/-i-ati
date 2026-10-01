import { randomUUID } from 'crypto'
import { mkdir, open, rm, stat, writeFile } from 'fs/promises'
import { dirname } from 'path'
import { createLogger } from '@main/logging/LogService'
import { resolveWorkspacePath } from '@main/services/filesystem/WorkspacePathResolver'
import type { WebFetchArtifact } from '@tools/webTools/index.d'

const logger = createLogger('WorkspaceWebFetchArtifactService')

export interface WebFetchSpoolFile {
  absolutePath: string
  relativePath: string
}

export interface SaveWebFetchResultArgs {
  spool: WebFetchSpoolFile
  contentType: string
  readableContent?: string
  summary: string
  signal?: AbortSignal
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
    const spool = this.resolve(`.tmp/web-fetch/${randomUUID()}.tmp`, 'creatable')
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

  async writeSpool(spool: WebFetchSpoolFile, content: Uint8Array): Promise<void> {
    await writeFile(spool.absolutePath, content, { flag: 'w' })
  }

  async saveResult(args: SaveWebFetchResultArgs): Promise<WebFetchArtifact> {
    try {
      args.signal?.throwIfAborted()
      // Text results replace the downloaded HTML with the readable body in the same file.
      // Binary results keep the original bytes.
      if (args.readableContent !== undefined) {
        await writeFile(args.spool.absolutePath, args.readableContent, {
          encoding: 'utf8', signal: args.signal
        })
      }
      args.signal?.throwIfAborted()
      return {
        kind: 'workspace_artifact',
        sourcePath: args.spool.relativePath,
        readPath: args.spool.relativePath,
        sizeBytes: await this.completedSize(args.spool),
        mimeType: args.readableContent !== undefined ? 'text/markdown; charset=utf-8' : args.contentType,
        summary: args.summary
      }
    } catch (error) {
      await this.cleanupSpool(args.spool)
      throw error
    }
  }
}

import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs'
import path from 'node:path'
import {
  canonicalizeThroughExistingPrefix,
  isPathWithin
} from '@main/services/filesystem/WorkspacePathBoundary'

export interface ToolResultArtifactStoreOptions {
  workspaceRoot?: string
}

export interface ToolResultArtifactWriteInput {
  rawContent: string
  images: Array<{ bytes: Buffer; mimeType: string; sourcePath: string }>
}

export interface ToolResultArtifactDescriptor {
  kind: 'raw_result' | 'image'
  path: string
  bytes: number
  sha256: string
  mimeType?: string
  sourcePath?: string
}

export interface ToolResultArtifactWriteResult {
  artifacts: ToolResultArtifactDescriptor[]
}

const sha256 = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex')

export class DefaultToolResultArtifactStore {
  constructor(private readonly options: ToolResultArtifactStoreOptions = {}) {}

  write(input: ToolResultArtifactWriteInput): ToolResultArtifactWriteResult {
    const workspaceRoot = path.resolve(this.options.workspaceRoot ?? process.cwd())
    const relativeDir = path.posix.join('.ati/artifacts/tools', sha256(input.rawContent))
    const rootDir = path.join(workspaceRoot, relativeDir)
    if (
      !isPathWithin(
        canonicalizeThroughExistingPrefix(rootDir),
        canonicalizeThroughExistingPrefix(workspaceRoot)
      )
    ) {
      throw new Error('Tool result artifact path escapes the workspace')
    }
    mkdirSync(rootDir, { recursive: true })
    const artifacts: ToolResultArtifactDescriptor[] = []
    const write = (
      relativePath: string,
      bytes: Buffer,
      metadata: Omit<ToolResultArtifactDescriptor, 'path' | 'bytes' | 'sha256'>
    ): void => {
      const absolutePath = path.join(workspaceRoot, relativePath)
      if (
        !isPathWithin(
          canonicalizeThroughExistingPrefix(absolutePath),
          canonicalizeThroughExistingPrefix(workspaceRoot)
        )
      ) {
        throw new Error('Tool result artifact file escapes the workspace')
      }
      mkdirSync(path.dirname(absolutePath), { recursive: true })
      const temporaryPath = path.join(path.dirname(absolutePath), `.part-${randomUUID()}`)
      try {
        writeFileSync(temporaryPath, bytes, { flag: 'wx' })
        renameSync(temporaryPath, absolutePath)
      } finally {
        rmSync(temporaryPath, { force: true })
      }
      artifacts.push({
        ...metadata,
        path: relativePath,
        bytes: bytes.length,
        sha256: sha256(bytes)
      })
    }
    write(path.posix.join(relativeDir, 'content.txt'), Buffer.from(input.rawContent, 'utf8'), {
      kind: 'raw_result',
      mimeType: 'text/plain'
    })
    input.images.forEach((image) => {
      const extension =
        (
          {
            'image/png': 'png',
            'image/jpeg': 'jpg',
            'image/gif': 'gif',
            'image/webp': 'webp'
          } as Record<string, string>
        )[image.mimeType] ?? 'bin'
      write(path.posix.join('.tmp/images', `${sha256(image.bytes)}.${extension}`), image.bytes, {
        kind: 'image',
        mimeType: image.mimeType,
        sourcePath: image.sourcePath
      })
    })
    return { artifacts }
  }
}

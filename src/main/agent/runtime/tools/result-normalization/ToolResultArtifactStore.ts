import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

export interface ToolResultArtifactStoreOptions {
  baseDir?: string
  scopeId?: string
}

export interface ToolResultArtifactWriteInput {
  stepId: string
  toolCallId: string
  rawContent: string
  images: Array<{
    bytes: Buffer
    mimeType: string
    sourcePath: string
  }>
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
  rootDir: string
  artifacts: ToolResultArtifactDescriptor[]
}

const sanitizePathSegment = (value: string): string => {
  const sanitized = value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 96)
  return sanitized || 'unknown'
}

const resolveDefaultBaseDir = (): string => {
  try {
    const electron = require('electron') as {
      app?: {
        isReady?: () => boolean
        getPath?: (name: 'userData') => string
      }
    }
    const userData = electron.app?.getPath?.('userData')
    if (userData) {
      return path.join(userData, 'tool-result-artifacts')
    }
  } catch {
    // Fall through to the test-friendly path.
  }

  return path.join(process.cwd(), '.tool-result-artifacts')
}

const sha256 = (bytes: Buffer | string): string => (
  createHash('sha256').update(bytes).digest('hex')
)

const extensionForMime = (mimeType: string): string => {
  switch (mimeType) {
    case 'image/png':
      return 'png'
    case 'image/jpeg':
      return 'jpg'
    case 'image/gif':
      return 'gif'
    case 'image/webp':
      return 'webp'
    default:
      return 'bin'
  }
}

export class DefaultToolResultArtifactStore {
  private readonly baseDir: string
  private readonly scopeId: string

  constructor(options: ToolResultArtifactStoreOptions = {}) {
    this.baseDir = options.baseDir ?? resolveDefaultBaseDir()
    this.scopeId = options.scopeId ?? 'runtime'
  }

  write(input: ToolResultArtifactWriteInput): ToolResultArtifactWriteResult {
    const rootDir = path.join(
      this.baseDir,
      sanitizePathSegment(this.scopeId),
      sanitizePathSegment(input.stepId),
      sanitizePathSegment(input.toolCallId)
    )

    if (!existsSync(rootDir)) {
      mkdirSync(rootDir, { recursive: true })
    }

    const artifacts: ToolResultArtifactDescriptor[] = []
    const rawBytes = gzipSync(Buffer.from(input.rawContent, 'utf8'))
    const rawPath = path.join(rootDir, 'raw-result.json.gz')
    writeFileSync(rawPath, rawBytes)
    artifacts.push({
      kind: 'raw_result',
      path: rawPath,
      bytes: rawBytes.byteLength,
      sha256: sha256(rawBytes)
    })

    input.images.forEach((image, index) => {
      const imagePath = path.join(rootDir, `image-${index + 1}.${extensionForMime(image.mimeType)}`)
      writeFileSync(imagePath, image.bytes)
      artifacts.push({
        kind: 'image',
        path: imagePath,
        bytes: image.bytes.byteLength,
        sha256: sha256(image.bytes),
        mimeType: image.mimeType,
        sourcePath: image.sourcePath
      })
    })

    writeFileSync(
      path.join(rootDir, 'metadata.json'),
      JSON.stringify({ artifacts }, null, 2)
    )

    return {
      rootDir,
      artifacts
    }
  }
}

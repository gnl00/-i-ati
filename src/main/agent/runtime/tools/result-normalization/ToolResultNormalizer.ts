import type { ToolResultFact } from '../ToolResultFact'
import {
  DefaultToolResultArtifactStore,
  type ToolResultArtifactDescriptor,
  type ToolResultArtifactStoreOptions
} from './ToolResultArtifactStore'

export type ToolResultNormalizationTrigger = 'inline_image' | 'large_content'

export interface NormalizedToolResultContent {
  __atiToolResultNormalized: true
  version: 1
  toolName: string
  toolCallId: string
  status: ToolResultFact['status']
  summary: string
  original: {
    characters: number
    triggers: ToolResultNormalizationTrigger[]
  }
  artifacts: ToolResultArtifactDescriptor[]
  modelContent: string
}

export interface ToolResultNormalizer {
  normalize(result: ToolResultFact): ToolResultFact
}

export interface ToolResultNormalizerOptions extends ToolResultArtifactStoreOptions {
  maxInlineCharacters?: number
}

interface ExtractedImage {
  bytes: Buffer
  mimeType: string
  sourcePath: string
}

const DEFAULT_MAX_INLINE_CHARACTERS = 32_000
const DATA_IMAGE_PATTERN = /data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=\r\n]+)/g

export const isNormalizedToolResultContent = (
  content: unknown
): content is NormalizedToolResultContent => (
  Boolean(
    content
    && typeof content === 'object'
    && (content as { __atiToolResultNormalized?: unknown }).__atiToolResultNormalized === true
  )
)

const safeStringify = (value: unknown): string => {
  if (typeof value === 'string') {
    return value
  }

  const seen = new WeakSet<object>()
  try {
    return JSON.stringify(value, (_key, nested) => {
      if (typeof nested === 'object' && nested !== null) {
        if (seen.has(nested)) {
          return '[Circular]'
        }
        seen.add(nested)
      }
      return nested
    })
  } catch {
    return String(value)
  }
}

const mimeFromMagic = (bytes: Buffer): string | null => {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (bytes.length >= 6 && bytes.subarray(0, 3).toString('ascii') === 'GIF') {
    return 'image/gif'
  }
  if (
    bytes.length >= 12
    && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
    && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp'
  }
  return null
}

const decodeBase64 = (value: string): Buffer | null => {
  const clean = value.replace(/\s/g, '')
  if (clean.length < 64 || clean.length % 4 === 1) {
    return null
  }

  try {
    return Buffer.from(clean, 'base64')
  } catch {
    return null
  }
}

const extractImagesFromString = (value: string, sourcePath: string): ExtractedImage[] => {
  const images: ExtractedImage[] = []
  for (const match of value.matchAll(DATA_IMAGE_PATTERN)) {
    const bytes = decodeBase64(match[2])
    if (!bytes) {
      continue
    }
    images.push({
      bytes,
      mimeType: match[1],
      sourcePath
    })
  }

  if (images.length > 0) {
    return images
  }

  const rawBytes = decodeBase64(value)
  const mimeType = rawBytes ? mimeFromMagic(rawBytes) : null
  if (rawBytes && mimeType) {
    images.push({
      bytes: rawBytes,
      mimeType,
      sourcePath
    })
  }

  return images
}

const collectImages = (
  value: unknown,
  sourcePath = 'content',
  images: ExtractedImage[] = [],
  seen = new WeakSet<object>()
): ExtractedImage[] => {
  if (typeof value === 'string') {
    images.push(...extractImagesFromString(value, sourcePath))
    return images
  }

  if (!value || typeof value !== 'object') {
    return images
  }

  if (seen.has(value)) {
    return images
  }
  seen.add(value)

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectImages(item, `${sourcePath}[${index}]`, images, seen))
    return images
  }

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    collectImages(nested, `${sourcePath}.${key}`, images, seen)
  }

  return images
}

const buildModelContent = (input: {
  summary: string
  artifacts: ToolResultArtifactDescriptor[]
  triggers: ToolResultNormalizationTrigger[]
  originalCharacters: number
}): string => (
  [
    '[Tool result normalized]',
    input.summary,
    `originalChars=${input.originalCharacters}`,
    `reason=${input.triggers.join(',')}`,
    ...input.artifacts.map((artifact, index) => (
      `artifact${index + 1}=${artifact.kind} path=${artifact.path} bytes=${artifact.bytes} sha256=${artifact.sha256}`
    ))
  ].join('\n')
)

export class DefaultToolResultNormalizer implements ToolResultNormalizer {
  private readonly artifactStore: DefaultToolResultArtifactStore
  private readonly maxInlineCharacters: number

  constructor(options: ToolResultNormalizerOptions = {}) {
    this.artifactStore = new DefaultToolResultArtifactStore(options)
    this.maxInlineCharacters = options.maxInlineCharacters ?? DEFAULT_MAX_INLINE_CHARACTERS
  }

  normalize(result: ToolResultFact): ToolResultFact {
    if (isNormalizedToolResultContent(result.content)) {
      return result
    }

    const rawContent = safeStringify(result.content)
    const images = collectImages(result.content)
    const triggers: ToolResultNormalizationTrigger[] = []

    if (images.length > 0) {
      triggers.push('inline_image')
    }

    if (rawContent.length > this.maxInlineCharacters) {
      triggers.push('large_content')
    }

    if (triggers.length === 0) {
      return result
    }

    const artifactResult = this.artifactStore.write({
      stepId: result.stepId,
      toolCallId: result.toolCallId,
      rawContent,
      images
    })
    const summary = images.length > 0
      ? `Tool result contained ${images.length} inline image artifact(s). Original payload was written to ${artifactResult.rootDir}.`
      : `Tool result exceeded inline budget. Original payload was written to ${artifactResult.rootDir}.`
    const modelContent = buildModelContent({
      summary,
      artifacts: artifactResult.artifacts,
      triggers,
      originalCharacters: rawContent.length
    })

    const content: NormalizedToolResultContent = {
      __atiToolResultNormalized: true,
      version: 1,
      toolName: result.toolName,
      toolCallId: result.toolCallId,
      status: result.status,
      summary,
      original: {
        characters: rawContent.length,
        triggers
      },
      artifacts: artifactResult.artifacts,
      modelContent
    }

    return {
      ...result,
      content
    } as ToolResultFact
  }
}

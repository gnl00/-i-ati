import type { ToolResultFact } from '../ToolResultFact'
import {
  formatToolResultForModel,
  projectToolResultContentForDisplay
} from '../ToolResultContentProjector'
import { compactToolContentForModelRequest } from '@shared/tools/toolResultContent'
import {
  DefaultToolResultArtifactStore,
  type ToolResultArtifactStoreOptions
} from './ToolResultArtifactStore'

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
const DATA_IMAGE_PATTERN = /data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/\r\n]+={0,2})/g

const mimeFromMagic = (bytes: Buffer): string | null => {
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (bytes.length >= 6 && bytes.subarray(0, 3).toString('ascii') === 'GIF') {
    return 'image/gif'
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
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

const stripExtractedImages = (
  value: unknown,
  imagePaths: Set<string>,
  sourcePath = 'content',
  seen = new WeakSet<object>()
): unknown => {
  if (typeof value === 'string') {
    if (!imagePaths.has(sourcePath)) return value
    return value.includes('data:image/')
      ? value.replace(DATA_IMAGE_PATTERN, '[Image saved as artifact]')
      : '[Image saved as artifact]'
  }
  if (!value || typeof value !== 'object') return value
  if (seen.has(value)) return '[Circular]'
  seen.add(value)
  if (Array.isArray(value))
    return value.map((item, index) =>
      stripExtractedImages(item, imagePaths, `${sourcePath}[${index}]`, seen)
    )
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      stripExtractedImages(item, imagePaths, `${sourcePath}.${key}`, seen)
    ])
  )
}

export class DefaultToolResultNormalizer implements ToolResultNormalizer {
  private readonly artifactStore: DefaultToolResultArtifactStore
  private readonly maxInlineCharacters: number

  constructor(options: ToolResultNormalizerOptions = {}) {
    this.artifactStore = new DefaultToolResultArtifactStore(options)
    this.maxInlineCharacters = options.maxInlineCharacters ?? DEFAULT_MAX_INLINE_CHARACTERS
  }

  normalize(result: ToolResultFact): ToolResultFact {
    if (
      result.modelContent !== undefined &&
      result.modelContent.length > this.maxInlineCharacters
    ) {
      result = { ...result, modelContent: undefined, modelContentKind: undefined }
    }
    const formatted = formatToolResultForModel(result)
    // Inspect the selected view, including base64 fields inside tool-owned JSON.
    let selectedContent: unknown = result.modelContent ?? result.content
    let modelPrefix = ''
    if (result.modelContent !== undefined) {
      try {
        selectedContent = JSON.parse(result.modelContent)
      } catch {
        const jsonStart = result.modelContent.indexOf('{')
        if (jsonStart >= 0) {
          try {
            selectedContent = JSON.parse(result.modelContent.slice(jsonStart))
            modelPrefix = result.modelContent.slice(0, jsonStart)
          } catch {
            /* Plain text views are scanned directly. */
          }
        }
      }
    }
    const images = result.modelContentKind === 'text' ? [] : collectImages(selectedContent)
    if (formatted.length <= this.maxInlineCharacters && images.length === 0) {
      return result.modelContent !== undefined ? result : { ...result, modelContent: formatted }
    }

    const rawContent = projectToolResultContentForDisplay(result)
    let recovery: string
    try {
      const saved = this.artifactStore.write({
        rawContent,
        images
      })
      recovery = [
        '[Tool result preview; original output saved]',
        ...saved.artifacts.slice(0, 9).map((artifact) => `${artifact.kind}: ${artifact.path}`),
        'Use read with the raw_result path; follow its line/column continuation to read more.'
      ].join('\n')
    } catch {
      recovery =
        '[Tool result preview; saving original output failed. Omitted content is not recoverable.]'
    }
    const failurePrefix =
      result.modelContent !== undefined
        ? modelPrefix
        : result.failure || result.error || result.status !== 'success'
          ? formatToolResultForModel({ ...result, content: null, modelContent: undefined }).slice(
              0,
              4_000
            ) + '\n'
          : ''
    const budget = Math.max(
      0,
      this.maxInlineCharacters - recovery.length - failurePrefix.length - 1
    )
    const previewSource =
      images.length > 0
        ? projectToolResultContentForDisplay({
            content: stripExtractedImages(
              selectedContent,
              new Set(images.map((image) => image.sourcePath))
            )
          })
        : (result.modelContent ?? rawContent)
    const preview = compactToolContentForModelRequest(previewSource, {
      maxCharacters: budget
    })
    return {
      ...result,
      modelContent: `${failurePrefix}${preview}\n${recovery}`.slice(0, this.maxInlineCharacters)
    }
  }
}

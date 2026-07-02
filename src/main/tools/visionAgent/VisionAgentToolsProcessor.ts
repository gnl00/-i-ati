import {
  ImageRefResolver,
  type ResolvedVisionImage
} from '@main/hosts/chat/vision/ImageRefResolver'
import {
  sanitizeVisionErrorReason,
  VisionRequestService,
  type VisionRequestResult
} from '@main/hosts/chat/vision/VisionRequestService'
import type {
  VisionAgentAnalyzeArgs,
  VisionAgentAnalyzeResponse,
  VisionAgentImageSource
} from '@tools/visionAgent/index.d'

export type VisionAgentToolsProcessorDeps = {
  imageRefResolver?: Pick<ImageRefResolver, 'resolveImages'>
  visionRequestService?: Pick<VisionRequestService, 'analyze'>
}

const VISION_AGENT_SYSTEM_PROMPT = [
  'You analyze images for an agent tool call.',
  'Follow the user prompt exactly as the visual task.',
  'Return plain text with the requested extracted facts and brief uncertainty notes when needed.'
].join('\n')
const DEFAULT_ANALYZE_TIMEOUT_SECONDS = 60
const MIN_ANALYZE_TIMEOUT_SECONDS = 5
const MAX_ANALYZE_TIMEOUT_SECONDS = 120

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim()
  }
  return 'unknown error'
}

const clampTimeoutSeconds = (value?: number): number => {
  if (!Number.isFinite(value)) return DEFAULT_ANALYZE_TIMEOUT_SECONDS
  return Math.min(
    Math.max(Math.floor(value as number), MIN_ANALYZE_TIMEOUT_SECONDS),
    MAX_ANALYZE_TIMEOUT_SECONDS
  )
}

export class VisionAgentToolsProcessor {
  private readonly imageRefResolver: Pick<ImageRefResolver, 'resolveImages'>
  private readonly visionRequestService: Pick<VisionRequestService, 'analyze'>

  constructor(deps: VisionAgentToolsProcessorDeps = {}) {
    this.imageRefResolver = deps.imageRefResolver ?? new ImageRefResolver()
    this.visionRequestService = deps.visionRequestService ?? new VisionRequestService()
  }

  async analyze(args: VisionAgentAnalyzeArgs): Promise<VisionAgentAnalyzeResponse> {
    const prompt = args.prompt?.trim()
    if (!prompt) {
      return {
        success: false,
        image_count: 0,
        images: [],
        message: 'prompt is required'
      }
    }

    const images = this.normalizeImageInputs(args)
    if (images.length === 0) {
      return {
        success: false,
        image_count: 0,
        images: [],
        message: 'at least one image ref, url, or raw_data item is required'
      }
    }

    try {
      const resolved = this.imageRefResolver.resolveImages(images, args.chat_uuid)
      const failed = resolved.filter(item => !item.success)
      if (failed.length > 0) {
        return {
          success: false,
          image_count: 0,
          images: [],
          message: failed
            .map(item => `${item.ref}: ${sanitizeVisionErrorReason(item.error)}`)
            .join('\n')
        }
      }

      const resolvedImages = resolved.flatMap(item => item.images)
      if (resolvedImages.length === 0) {
        return {
          success: false,
          image_count: 0,
          images: [],
          message: 'at least one image ref, url, or raw_data item is required'
        }
      }

      const result: VisionRequestResult = await this.visionRequestService.analyze({
        imageUrls: resolvedImages.map(image => image.url),
        prompt,
        systemPrompt: VISION_AGENT_SYSTEM_PROMPT,
        timeoutLabel: 'vision agent analysis',
        timeoutMs: clampTimeoutSeconds(args.timeout_seconds) * 1000
      })

      return {
        success: true,
        result: result.text,
        image_count: resolvedImages.length,
        images: this.toImageSources(resolvedImages),
        message: `Analyzed ${resolvedImages.length} image${resolvedImages.length === 1 ? '' : 's'}.`
      }
    } catch (error) {
      return {
        success: false,
        image_count: 0,
        images: [],
        message: sanitizeVisionErrorReason(getErrorMessage(error))
      }
    }
  }

  private normalizeImageInputs(args: VisionAgentAnalyzeArgs): NonNullable<VisionAgentAnalyzeArgs['images']> {
    return [
      ...(Array.isArray(args.images) ? args.images : []),
      ...(Array.isArray(args.image_refs) ? args.image_refs.map(ref => ({ ref })) : []),
      ...(Array.isArray(args.urls) ? args.urls.map(url => ({ url })) : []),
      ...(Array.isArray(args.raw_data) ? args.raw_data.map(rawData => ({ raw_data: rawData })) : [])
    ]
  }

  private toImageSources(images: ResolvedVisionImage[]): VisionAgentImageSource[] {
    return images.map((image, index): VisionAgentImageSource => {
      if (image.ref.startsWith('message:')) {
        return {
          type: 'ref',
          ref: image.ref
        }
      }
      if (image.ref.startsWith('input:')) {
        return {
          type: 'raw_data',
          ref: image.ref
        }
      }
      return {
        type: 'url',
        ref: `input:${index + 1}`
      }
    })
  }
}

const defaultProcessor = new VisionAgentToolsProcessor()

export const processVisionAgentAnalyze = (
  args: VisionAgentAnalyzeArgs
): Promise<VisionAgentAnalyzeResponse> => defaultProcessor.analyze(args)

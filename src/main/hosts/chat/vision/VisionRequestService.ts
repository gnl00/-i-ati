import { AppConfigStore, ChatModelContextResolver } from '../config'
import { createUnifiedRequest, type CreateUnifiedRequestInput } from '@main/request/UnifiedRequestFactory'
import { unifiedChatRequest } from '@main/request/index'
import { resolveRequestOverrides } from '@main/request/overrides'
import { isVisionModel, resolveVisionModelRef } from '@shared/services/ChatModelResolver'

export type VisionRequestFn = (
  req: IUnifiedRequest,
  signal: AbortSignal | null,
  beforeFetch: Function,
  afterFetch: Function
) => Promise<IUnifiedResponse>

export type VisionRequestServiceDeps = {
  appConfigStore?: Pick<AppConfigStore, 'requireConfig'>
  modelContextResolver?: Pick<ChatModelContextResolver, 'resolve'>
  createRequest?: (input: CreateUnifiedRequestInput) => IUnifiedRequest
  request?: VisionRequestFn
  timeoutMs?: number
}

export type VisionRequestInput = {
  imageUrls: string[]
  prompt: string
  systemPrompt: string
  timeoutLabel?: string
  timeoutMs?: number
}

export type VisionRequestResult = {
  text: string
  model: string
  imageCount: number
}

const DEFAULT_VISION_REQUEST_TIMEOUT_MS = 20_000
const REDACTED_SECRET = '[REDACTED]'

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const getErrorReason = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim()
  }

  return 'unknown error'
}

const redactKnownSecrets = (value: string, secrets: string[]): string => {
  let redacted = value
  for (const secret of secrets) {
    const trimmed = secret.trim()
    if (trimmed.length < 4) {
      continue
    }
    redacted = redacted.replace(new RegExp(escapeRegExp(trimmed), 'g'), REDACTED_SECRET)
  }

  return redacted
}

const redactCredentialShapes = (value: string): string => value
  .replace(/data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=_-]{16,}/gi, `data:image/*;base64,${REDACTED_SECRET}`)
  .replace(/\b[A-Za-z0-9+/=_-]{160,}\b/g, REDACTED_SECRET)
  .replace(/\bAuthorization\s*[:=]\s*(?:"[^"]*"|'[^']*'|Bearer\s+[A-Za-z0-9._~+/=-]+|[^\s,;}]+)/gi, `Authorization: ${REDACTED_SECRET}`)
  .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, `Bearer ${REDACTED_SECRET}`)
  .replace(/\bsk-[A-Za-z0-9][A-Za-z0-9_-]{8,}\b/g, REDACTED_SECRET)
  .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, REDACTED_SECRET)
  .replace(/\b(?:api[-_]?key|x-api-key)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi, (match) => {
    const separatorIndex = Math.max(match.indexOf(':'), match.indexOf('='))
    return separatorIndex >= 0
      ? `${match.slice(0, separatorIndex + 1)} ${REDACTED_SECRET}`
      : REDACTED_SECRET
  })
  .replace(/([?&](?:api_key|apikey|key|token|signature|X-Amz-Signature|X-Amz-Credential|X-Amz-Security-Token|AWSAccessKeyId)=)[^&\s]+/g, `$1${REDACTED_SECRET}`)

export const sanitizeVisionErrorReason = (reason: string, secrets: string[] = []): string => (
  redactCredentialShapes(redactKnownSecrets(reason, secrets))
)

export class VisionRequestService {
  private readonly appConfigStore: Pick<AppConfigStore, 'requireConfig'>
  private readonly modelContextResolver: Pick<ChatModelContextResolver, 'resolve'>
  private readonly createRequest: (input: CreateUnifiedRequestInput) => IUnifiedRequest
  private readonly request: VisionRequestFn
  private readonly timeoutMs: number

  constructor(deps: VisionRequestServiceDeps = {}) {
    this.appConfigStore = deps.appConfigStore ?? new AppConfigStore()
    this.modelContextResolver = deps.modelContextResolver ?? new ChatModelContextResolver()
    this.createRequest = deps.createRequest ?? createUnifiedRequest
    this.request = deps.request ?? unifiedChatRequest
    this.timeoutMs = deps.timeoutMs ?? DEFAULT_VISION_REQUEST_TIMEOUT_MS
  }

  async analyze(input: VisionRequestInput): Promise<VisionRequestResult> {
    const redactionSecrets: string[] = []

    try {
      const imageUrls = input.imageUrls.map(url => url.trim()).filter(Boolean)
      const prompt = input.prompt.trim()

      if (imageUrls.length === 0) {
        throw new Error('no image media found')
      }
      if (!prompt) {
        throw new Error('prompt is required')
      }

      const config = this.appConfigStore.requireConfig()
      const visionModelRef = resolveVisionModelRef(config)
      if (!visionModelRef) {
        throw new Error('vision model unavailable')
      }

      const modelContext = this.modelContextResolver.resolve(config, visionModelRef)
      if (!modelContext || !isVisionModel(modelContext.model)) {
        throw new Error('vision model unavailable')
      }
      redactionSecrets.push(modelContext.account.apiKey)

      const request = this.createRequest({
        adapterPluginId: modelContext.providerDefinition.adapterPluginId,
        baseUrl: modelContext.account.apiUrl,
        apiKey: modelContext.account.apiKey,
        model: modelContext.model.id,
        modelType: modelContext.model.type,
        messages: [{
          role: 'system',
          content: input.systemPrompt
        }, {
          role: 'user',
          content: [
            ...imageUrls.map((url): VLMContent => ({
              type: 'image_url',
              image_url: {
                url,
                detail: 'auto'
              }
            })),
            {
              type: 'text',
              text: prompt
            }
          ]
        }],
        stream: false,
        payloadExtensions: modelContext.providerDefinition.payloadExtensions,
        requestOverrides: resolveRequestOverrides(
          modelContext.providerDefinition.requestOverrides,
          'chat'
        )
      })

      const response = await this.requestWithTimeout(
        request,
        input.timeoutLabel ?? 'vision request',
        input.timeoutMs
      )
      const text = response?.content?.trim()
      if (!text) {
        throw new Error('empty vision response')
      }

      return {
        text,
        model: modelContext.model.id,
        imageCount: imageUrls.length
      }
    } catch (error) {
      throw new Error(sanitizeVisionErrorReason(getErrorReason(error), redactionSecrets))
    }
  }

  private async requestWithTimeout(
    request: IUnifiedRequest,
    timeoutLabel: string,
    timeoutMs = this.timeoutMs
  ): Promise<IUnifiedResponse> {
    const controller = new AbortController()
    let timedOut = false
    let timeout: ReturnType<typeof setTimeout> | null = null
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        timedOut = true
        controller.abort()
        reject(new Error(`${timeoutLabel} timed out after ${timeoutMs}ms`))
      }, timeoutMs)
    })

    try {
      return await Promise.race([
        this.request(request, controller.signal, () => {}, () => {}),
        timeoutPromise
      ])
    } catch (error) {
      if (timedOut) {
        throw new Error(`${timeoutLabel} timed out after ${timeoutMs}ms`)
      }
      throw error
    } finally {
      if (timeout) {
        clearTimeout(timeout)
      }
    }
  }
}

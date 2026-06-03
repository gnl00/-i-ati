import { createLogger } from '@main/logging/LogService'
import { getRequestErrorMetadata, unifiedChatRequest } from '@main/request/index'
import { createUnifiedTextRequest } from '@main/request/UnifiedRequestFactory'
import type {
  ProviderTestConnectionRequest,
  ProviderTestConnectionResponse
} from '@shared/providers/testConnection'

export interface ProviderConnectionTestServiceOptions {
  timeoutMs?: number
  request?: typeof unifiedChatRequest
}

const DEFAULT_TIMEOUT_MS = 20_000
const TEST_MESSAGE = 'ping'

export class ProviderConnectionTestService {
  private readonly logger = createLogger('ProviderConnectionTestService')
  private readonly timeoutMs: number
  private readonly request: typeof unifiedChatRequest

  constructor(options: ProviderConnectionTestServiceOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.request = options.request ?? unifiedChatRequest
  }

  async testConnection(input: ProviderTestConnectionRequest): Promise<ProviderTestConnectionResponse> {
    const model = input.account.models.find(item => item.enabled === true)
    const modelId = model?.id ?? ''

    if (!input.providerDefinition.adapterPluginId) {
      return this.failed(modelId, 'Missing adapter plugin id')
    }

    if (!input.account.apiUrl.trim()) {
      return this.failed(modelId, 'Missing API URL')
    }

    if (!input.account.apiKey.trim()) {
      return this.failed(modelId, 'Missing API key')
    }

    if (!model) {
      return this.failed(modelId, 'Missing enabled provider model')
    }

    const abortController = new AbortController()
    const timeout = setTimeout(() => abortController.abort(), this.timeoutMs)

    try {
      const request = createUnifiedTextRequest({
        adapterPluginId: input.providerDefinition.adapterPluginId,
        baseUrl: input.account.apiUrl,
        apiKey: input.account.apiKey,
        model: model.id,
        modelType: model.type,
        content: TEST_MESSAGE,
        stream: false,
        requestOverrides: {
          ...input.providerDefinition.requestOverrides,
          stream: false
        },
        options: {}
      })

      const response = await this.request(request, abortController.signal, () => {}, () => {})
      const content = typeof response?.content === 'string' ? response.content.trim() : ''

      if (!content) {
        return this.failed(model.id, 'Provider returned empty content')
      }

      this.logger.info('test_connection.completed', {
        providerId: input.providerDefinition.id,
        accountId: input.account.id,
        modelId: model.id
      })

      return {
        ok: true,
        modelId: model.id,
        contentPreview: content.slice(0, 120)
      }
    } catch (error) {
      return this.failed(model.id, this.formatError(error))
    } finally {
      clearTimeout(timeout)
    }
  }

  private failed(modelId: string, error: string): ProviderTestConnectionResponse {
    return {
      ok: false,
      modelId,
      error
    }
  }

  private formatError(error: unknown): string {
    const metadata = getRequestErrorMetadata(error)
    if (metadata?.message) {
      return metadata.message
    }

    if (error instanceof Error) {
      return error.message
    }

    return String(error)
  }
}

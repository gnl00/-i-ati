import { net } from 'electron'
import { createLogger } from '@main/logging/LogService'
import {
  mapApiModelsResponseToAccountModels,
  normalizeModelsEndpoint,
  type FetchProviderModelsRequest,
  type FetchProviderModelsResponse
} from '@shared/providers/fetchModels'

type FetchLike = typeof fetch

export interface ProviderModelsFetchServiceOptions {
  fetchImpl?: FetchLike
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 30_000

export class ProviderModelsFetchService {
  private readonly logger = createLogger('ProviderModelsFetchService')
  private readonly effectiveFetch: FetchLike
  private readonly timeoutMs: number

  constructor(options: ProviderModelsFetchServiceOptions = {}) {
    this.effectiveFetch = options.fetchImpl ?? this.resolveDefaultFetch()
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  async fetchModels(request: FetchProviderModelsRequest): Promise<FetchProviderModelsResponse> {
    const endpoint = normalizeModelsEndpoint(request.account.apiUrl)

    if (!endpoint) {
      return this.failed('Missing API URL')
    }

    const apiKey = request.account.apiKey.trim()
    if (!apiKey) {
      return this.failed('Missing API key', endpoint)
    }

    const abortController = new AbortController()
    const timeout = setTimeout(() => abortController.abort(), this.timeoutMs)

    try {
      this.logger.info('provider_models.fetch_start', {
        providerId: request.account.providerId,
        accountId: request.account.id,
        endpoint
      })

      const response = await this.effectiveFetch(endpoint, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json'
        },
        signal: abortController.signal
      })

      if (!response.ok) {
        return this.failed(
          await this.formatHttpError(response, apiKey),
          endpoint,
          response.status
        )
      }

      const payload = await response.json()
      const models = mapApiModelsResponseToAccountModels(payload)

      this.logger.info('provider_models.fetch_completed', {
        providerId: request.account.providerId,
        accountId: request.account.id,
        endpoint,
        count: models.length
      })

      return {
        ok: true,
        models,
        endpoint
      }
    } catch (error) {
      return this.failed(this.formatNetworkError(error, apiKey), endpoint)
    } finally {
      clearTimeout(timeout)
    }
  }

  private failed(error: string, endpoint?: string, status?: number): FetchProviderModelsResponse {
    return {
      ok: false,
      error,
      endpoint,
      status
    }
  }

  private async formatHttpError(response: Response, apiKey: string): Promise<string> {
    const bodyText = await response.text().catch(() => '')
    const bodyMessage = this.extractErrorMessage(bodyText, apiKey)
    const statusText = response.statusText.trim()
    const statusLabel = statusText
      ? `HTTP ${response.status} ${statusText}`
      : `HTTP ${response.status}`

    return bodyMessage ? `${statusLabel}: ${bodyMessage}` : statusLabel
  }

  private extractErrorMessage(bodyText: string, apiKey: string): string {
    const trimmedBody = bodyText.trim()
    if (!trimmedBody) {
      return ''
    }

    try {
      const parsed = JSON.parse(trimmedBody)
      if (typeof parsed?.error?.message === 'string') {
        return this.redactApiKey(parsed.error.message, apiKey)
      }
      if (typeof parsed?.message === 'string') {
        return this.redactApiKey(parsed.message, apiKey)
      }
      if (typeof parsed?.error === 'string') {
        return this.redactApiKey(parsed.error, apiKey)
      }
    } catch {
      return this.redactApiKey(trimmedBody.slice(0, 300), apiKey)
    }

    return this.redactApiKey(trimmedBody.slice(0, 300), apiKey)
  }

  private formatNetworkError(error: unknown, apiKey: string): string {
    if (this.isAbortError(error)) {
      return `Request timeout (${Math.round(this.timeoutMs / 1000)}s)`
    }

    if (error instanceof Error && error.message.trim()) {
      return this.redactApiKey(error.message, apiKey)
    }

    return this.redactApiKey(String(error), apiKey)
  }

  private redactApiKey(message: string, apiKey: string): string {
    if (!apiKey) {
      return message
    }
    return message.split(apiKey).join('[redacted-api-key]')
  }

  private isAbortError(error: unknown): boolean {
    return Boolean(
      error &&
      typeof error === 'object' &&
      (error as { name?: unknown }).name === 'AbortError'
    )
  }

  private resolveDefaultFetch(): FetchLike {
    if (typeof net?.fetch === 'function') {
      return net.fetch.bind(net) as FetchLike
    }
    return fetch
  }
}

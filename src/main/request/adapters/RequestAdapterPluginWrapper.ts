import type { RequestAdapterHooks } from '@shared/plugins/requestAdapterHooks'
import { BaseAdapter } from './base'

export class RequestAdapterPluginWrapper extends BaseAdapter {
  providerType: ProviderType
  private currentRequest: IUnifiedRequest | null = null

  constructor(private readonly hooks: RequestAdapterHooks) {
    super()
    this.providerType = hooks.providerType
    this.streamProtocol = hooks.streamProtocol ?? 'sse'
  }

  buildHeaders(req: IUnifiedRequest): Record<string, string> {
    this.currentRequest = req
    return this.hooks.request({ request: req }).headers ?? {}
  }

  buildRequest(req: IUnifiedRequest): any {
    this.currentRequest = req
    return this.hooks.request({ request: req }).body
  }

  getEndpoint(_baseUrl: string, req?: IUnifiedRequest): string {
    const currentRequest = req ?? this.currentRequest
    if (!currentRequest) {
      throw new Error('Request adapter hooks require an active request context')
    }
    return this.hooks.request({ request: currentRequest }).endpoint
  }

  parseResponse(response: any): IUnifiedResponse {
    const currentRequest = this.requireCurrentRequest()
    return this.hooks.parseResponse({
      request: currentRequest,
      raw: response
    })
  }

  parseStreamResponse(chunk: string): IUnifiedStreamResponse | null {
    const parseStreamResponse = this.hooks.parseStreamResponse
    if (!parseStreamResponse) {
      return null
    }

    return parseStreamResponse({
      request: this.requireCurrentRequest(),
      chunk
    })
  }

  supportsStreamOptionsUsage(): boolean {
    return this.hooks.supportsStreamOptionsUsage ?? false
  }

  private requireCurrentRequest(): IUnifiedRequest {
    if (!this.currentRequest) {
      throw new Error('Request adapter hooks require an active request context')
    }
    return this.currentRequest
  }
}

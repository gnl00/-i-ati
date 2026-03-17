export type RequestAdapterStreamProtocol = 'sse' | 'raw'

export interface RequestAdapterRequestResult {
  endpoint: string
  headers?: Record<string, string>
  body: unknown
}

export interface RequestAdapterRequestHookContext {
  request: IUnifiedRequest
}

export interface RequestAdapterParseResponseHookContext {
  request: IUnifiedRequest
  raw: unknown
}

export interface RequestAdapterParseStreamResponseHookContext {
  request: IUnifiedRequest
  chunk: string
}

export interface RequestAdapterHooks {
  providerType: ProviderType
  streamProtocol?: RequestAdapterStreamProtocol
  supportsStreamOptionsUsage?: boolean
  request: (context: RequestAdapterRequestHookContext) => RequestAdapterRequestResult
  parseResponse: (context: RequestAdapterParseResponseHookContext) => IUnifiedResponse
  parseStreamResponse?: (context: RequestAdapterParseStreamResponseHookContext) => IUnifiedStreamResponse | null
}

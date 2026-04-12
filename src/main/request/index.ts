import { pluginDb } from '@main/db/plugins'
import { createLogger } from '@main/logging/LogService'
import {
  getRequestAdapterPluginById,
  isRequestAdapterPluginEnabled,
  resolveAdapterForRequest
} from './adapters/index'

const logger = createLogger('UnifiedRequest')
const REQUEST_ERROR_METADATA = '__requestErrorMetadata'

type RequestErrorKind = 'abort' | 'http' | 'network' | 'unknown'

export interface RequestErrorMetadata {
  kind: RequestErrorKind
  retriable: boolean
  name?: string
  message: string
  code?: string
  status?: number
  statusText?: string
  requestId?: string
  detail?: string
  causeName?: string
  causeMessage?: string
  causeCode?: string
}

type RequestErrorWithMetadata = Error & {
  __requestLogged?: boolean
  [REQUEST_ERROR_METADATA]?: RequestErrorMetadata
}

const toObjectLike = (value: unknown): Record<string, unknown> | undefined => (
  value && typeof value === 'object' ? value as Record<string, unknown> : undefined
)

const getStringField = (value: Record<string, unknown> | undefined, key: string): string | undefined => {
  const field = value?.[key]
  return typeof field === 'string' ? field : undefined
}

const NETWORK_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET'
])

const looksLikeNetworkError = (
  error: Error,
  causeName?: string,
  causeMessage?: string,
  causeCode?: string,
  errorCode?: string
): boolean => {
  const message = error.message.toLowerCase()
  const name = error.name.toLowerCase()
  const causeNameLower = causeName?.toLowerCase()
  const causeMessageLower = causeMessage?.toLowerCase()

  return (
    message.includes('fetch failed')
    || message.includes('failed to fetch')
    || message.includes('networkerror')
    || name.includes('network')
    || causeNameLower?.includes('network') === true
    || causeNameLower?.includes('socket') === true
    || causeMessageLower?.includes('socket') === true
    || causeMessageLower?.includes('network') === true
    || (causeCode ? NETWORK_ERROR_CODES.has(causeCode) : false)
    || (errorCode ? NETWORK_ERROR_CODES.has(errorCode) : false)
  )
}

const normalizeRequestError = (
  error: unknown,
  signal: AbortSignal | null,
  httpContext?: {
    status: number
    statusText: string
    requestId?: string
    detail?: string
    message?: string
  }
): RequestErrorMetadata => {
  if (httpContext) {
    return {
      kind: 'http',
      retriable: httpContext.status === 408 || httpContext.status === 429 || httpContext.status >= 500,
      name: 'HTTPError',
      message: httpContext.message || `HTTP ${httpContext.status} ${httpContext.statusText}`.trim(),
      status: httpContext.status,
      statusText: httpContext.statusText,
      requestId: httpContext.requestId,
      detail: httpContext.detail
    }
  }

  if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
    return {
      kind: 'abort',
      retriable: false,
      name: error instanceof Error ? error.name : 'AbortError',
      message: error instanceof Error ? error.message : 'Request aborted'
    }
  }

  const cause = error instanceof Error ? toObjectLike(error.cause) : undefined
  const causeCode = getStringField(cause, 'code')
  const causeMessage = getStringField(cause, 'message')
  const causeName = getStringField(cause, 'name')
  const errorCode = error instanceof Error ? getStringField(toObjectLike(error), 'code') : undefined

  if (error instanceof Error && looksLikeNetworkError(error, causeName, causeMessage, causeCode, errorCode)) {
    return {
      kind: 'network',
      retriable: true,
      name: error.name,
      message: error.message,
      code: errorCode,
      causeName,
      causeMessage,
      causeCode
    }
  }

  if (error instanceof Error) {
    return {
      kind: 'unknown',
      retriable: false,
      name: error.name,
      message: error.message,
      code: errorCode,
      causeName,
      causeMessage,
      causeCode
    }
  }

  return {
    kind: 'unknown',
    retriable: false,
    message: String(error)
  }
}

const attachRequestErrorMetadata = (
  error: Error,
  metadata: RequestErrorMetadata
): RequestErrorWithMetadata => {
  const errorWithMetadata = error as RequestErrorWithMetadata
  errorWithMetadata[REQUEST_ERROR_METADATA] = metadata
  return errorWithMetadata
}

export const getRequestErrorMetadata = (error: unknown): RequestErrorMetadata | undefined => {
  if (!error || typeof error !== 'object') {
    return undefined
  }
  return (error as RequestErrorWithMetadata)[REQUEST_ERROR_METADATA]
}

export const unifiedChatRequest = async (req: IUnifiedRequest, signal: AbortSignal | null, beforeFetch: Function, afterFetch: Function): Promise<any> => {
  const pluginConfigs = pluginDb.getPluginConfigs()
  const plugins = pluginDb.getPlugins()

  let adapter
  const adapterPluginId = req.adapterPluginId

  if (!isRequestAdapterPluginEnabled(pluginConfigs, adapterPluginId, plugins)) {
    const plugin = getRequestAdapterPluginById(adapterPluginId, plugins)
    const pluginName = plugin?.name ?? adapterPluginId
    throw new Error(`Request adapter plugin disabled: ${pluginName}`)
  }

  if (!adapterPluginId) {
    throw new Error('Missing adapter plugin id')
  }
  adapter = await resolveAdapterForRequest(adapterPluginId, plugins)
  const headers = adapter.buildHeaders(req)

  const requestBody = adapter.buildRequest(req)
  if (req.requestOverrides && typeof req.requestOverrides === 'object' && !Array.isArray(req.requestOverrides)) {
    applyRequestOverrides(requestBody, req.requestOverrides)
  }
  if (requestBody.stream !== false && adapter.supportsStreamOptionsUsage()) {
    if (!requestBody.stream_options || typeof requestBody.stream_options !== 'object') {
      requestBody.stream_options = { include_usage: true }
    } else if (requestBody.stream_options.include_usage === undefined) {
      requestBody.stream_options.include_usage = true
    }
  }
  beforeFetch()
  let endpoint: string | undefined
  try {
    // Use adapter to construct complete endpoint URL
    const resolvedEndpoint: string = adapter.getEndpoint(req.baseUrl, req)
    endpoint = resolvedEndpoint

    logger.info('request.dispatch', {
      baseUrl: req.baseUrl,
      adapterPluginId,
      model: req.model,
      endpoint: resolvedEndpoint,
      stream: req.stream ?? true,
      // body: JSON.stringify(requestBody)
    })

    const fetchResponse = await fetch(resolvedEndpoint, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({
        ...requestBody
      })
    })

    if (!fetchResponse.ok) {
      const rawText = await fetchResponse.text()
      let errorJson: any = null
      try {
        errorJson = rawText ? JSON.parse(rawText) : null
      } catch {
        errorJson = null
      }

      const status = fetchResponse.status
      const statusText = fetchResponse.statusText
      const requestId = errorJson?.request_id || errorJson?.error?.request_id
      const errorMessage = errorJson?.error?.message || errorJson?.message
      const detail = errorJson ? JSON.stringify(errorJson) : rawText

      const summary = [
        `HTTP ${status} ${statusText}`.trim(),
        requestId ? `request_id=${requestId}` : '',
        errorMessage ? `message=${errorMessage}` : '',
        detail ? `body=${detail}` : ''
      ].filter(Boolean).join(' | ')

      const metadata = normalizeRequestError(undefined, signal, {
        status,
        statusText,
        requestId,
        detail,
        message: summary
      })
      const requestError = attachRequestErrorMetadata(new Error(summary), metadata)
      logger.error('request.failed', {
        baseUrl: req.baseUrl,
        adapterPluginId,
        model: req.model,
        endpoint,
        stream: req.stream ?? true,
        signalAborted: Boolean(signal?.aborted),
        ...metadata
      })
      requestError.__requestLogged = true
      throw requestError
    }
    const streamEnabled = req.stream ?? true
    if (streamEnabled) {
      const reader = fetchResponse.body?.pipeThrough(new TextDecoderStream()).getReader()
      return reader && adapter.transformStreamResponse(reader)
    } else {
      const response = adapter.parseResponse(await fetchResponse.json())
      return response
    }

  } catch (error: any) {
    const metadata = getRequestErrorMetadata(error) ?? normalizeRequestError(error, signal)
    const enrichedError = error instanceof Error ? attachRequestErrorMetadata(error, metadata) : error
    if (!error?.__requestLogged) {
      logger.error('request.failed', {
        baseUrl: req.baseUrl,
        adapterPluginId,
        model: req.model,
        endpoint,
        stream: req.stream ?? true,
        signalAborted: Boolean(signal?.aborted),
        ...metadata
      })
    }
    throw enrichedError
  } finally {
    afterFetch()
  }
}

const FORBIDDEN_OVERRIDE_KEYS = new Set(['stream', 'messages', 'tools', 'model'])

const isPlainObject = (value: any): value is Record<string, any> => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

const hasForbiddenKey = (obj: any): boolean => {
  if (!isPlainObject(obj)) return false
  for (const [key, value] of Object.entries(obj)) {
    if (FORBIDDEN_OVERRIDE_KEYS.has(key)) return true
    if (isPlainObject(value) && hasForbiddenKey(value)) return true
    if (Array.isArray(value)) {
      for (const item of value) {
        if (hasForbiddenKey(item)) return true
      }
    }
  }
  return false
}

const applyRequestOverrides = (target: any, overrides: Record<string, any>): void => {
  if (hasForbiddenKey(overrides)) {
    logger.warn('request_overrides.forbidden_keys_ignored')
    return
  }
  mergeDeep(target, overrides)
}

const mergeDeep = (target: any, source: any): void => {
  if (!isPlainObject(source) || !isPlainObject(target)) {
    return
  }
  Object.entries(source).forEach(([key, value]) => {
    if (FORBIDDEN_OVERRIDE_KEYS.has(key)) {
      return
    }
    if (isPlainObject(value)) {
      if (!isPlainObject(target[key])) {
        target[key] = {}
      }
      mergeDeep(target[key], value)
    } else {
      target[key] = value
    }
  })
}

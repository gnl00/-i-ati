import DatabaseService from '@main/services/DatabaseService'
import {
  adapterManager,
  getRequestAdapterPluginById,
  isRequestAdapterPluginEnabled,
  syncAdaptersWithPlugins
} from './adapters/index'

export const unifiedChatRequest = async (req: IUnifiedRequest, signal: AbortSignal | null, beforeFetch: Function, afterFetch: Function): Promise<any> => {
  const pluginConfigs = DatabaseService.getPluginConfigs()
  const plugins = DatabaseService.getPlugins()
  await syncAdaptersWithPlugins(plugins)

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
  adapter = adapterManager.getAdapter(adapterPluginId)
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
  try {
    // Use adapter to construct complete endpoint URL
    const endpoint = adapter.getEndpoint(req.baseUrl, req)

    console.log(`[Request] baseUrl: ${req.baseUrl}`)
    console.log(`[Request] adapterPluginId: ${adapterPluginId}`)
    console.log(`[Request] endpoint: ${endpoint}`)
    // const {messages, tools, ...rest} = requestBody
    // console.log(`[Request] payloads: ${JSON.stringify(rest)}`)
    // console.log(`[Request] messages: ${JSON.stringify(messages)}`)

    const fetchResponse = await fetch(endpoint, {
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

      throw new Error(summary)
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
    throw error
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
    console.warn('[Request] requestOverrides contains forbidden keys, ignoring')
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

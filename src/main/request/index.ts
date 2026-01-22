import { initializeAdapters } from './adapters/index'
import { adapterManager } from './adapters/manager'

initializeAdapters()

export const unifiedChatRequest = async (req: IUnifiedRequest, signal: AbortSignal | null, beforeFetch: Function, afterFetch: Function): Promise<any> => {

  let adapter
  if (req.modelType === 't2i') {
    adapter = adapterManager.getAdapter(req.providerType ?? 'openai', req.apiVersion ?? 'gpt-image-1')
  } else {
    adapter = adapterManager.getAdapter(req.providerType ?? 'openai', req.apiVersion ?? 'v1')
  }
  const headers = adapter.buildHeaders(req)
  const customHeaders = adapter.getHeaders?.(req)
  if (customHeaders) {
    Object.assign(headers, customHeaders)
  }

  const requestBody = adapter.transformRequest(req)
  if (req.requestOverrides && typeof req.requestOverrides === 'object' && !Array.isArray(req.requestOverrides)) {
    applyRequestOverrides(requestBody, req.requestOverrides)
  }
  if (requestBody.messages) {
    requestBody.messages = requestBody.messages.map((m): BaseChatMessage => ({
      role: m.role,
      content: m.content,
      ...(m.name && { name: m.name }),
      ...(m.toolCalls && { tool_calls: m.toolCalls }),  // 驼峰转下划线
      ...(m.toolCallId && { tool_call_id: m.toolCallId })  // 驼峰转下划线
    }))
  }

  beforeFetch()
  try {
    // Use adapter to construct complete endpoint URL
    const endpoint = adapter.getEndpoint(req.baseUrl)

    console.log(`[Request] baseUrl: ${req.baseUrl}`)
    console.log(`[Request] adapter: ${adapter.providerType}/${adapter.apiVersion}`)
    console.log(`[Request] endpoint: ${endpoint}`)
    const {messages, tools, ...rest} = requestBody
    console.log(`[Request] payloads: ${JSON.stringify(rest)}`)
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
      const resp = await fetchResponse.json()
      throw new Error(`Error=${JSON.stringify(resp)}, Text=${fetchResponse.statusText}`)
    }
    const streamEnabled = req.stream ?? true
    if (streamEnabled) {
      const reader = fetchResponse.body?.pipeThrough(new TextDecoderStream()).getReader()
      return reader && adapter.transformStreamResponse(reader)
    } else {
      const response = adapter.transformNotStreamResponse(await fetchResponse.json())
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

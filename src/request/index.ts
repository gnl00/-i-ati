import { initializeAdapters } from './adapters/index'
import { adapterManager } from './adapters/manager'

initializeAdapters()

const authorizationPreffix = 'Bearer '

// const getHeanders: IHeaders = {}

const postHeanders: IHeaders = {
  // 'Access-Control-Allow-Origin': '*',
  'content-type': 'application/json',
  accept: 'application/json'
}

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
    // ✅ Use adapter to construct complete endpoint URL
    const endpoint = adapter.getEndpoint(req.baseUrl)

    console.log(`[Request] baseUrl: ${req.baseUrl}`)
    console.log(`[Request] adapter: ${adapter.providerType}/${adapter.apiVersion}`)
    console.log(`[Request] endpoint: ${endpoint}`)

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
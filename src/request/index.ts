import { adapterManager } from './adapters/manager'
import { initializeAdapters } from './adapters/index'

initializeAdapters()

const authorizationPreffix = 'Bearer '

// const getHeanders: IHeaders = {}

const postHeanders: IHeaders = {
  // 'Access-Control-Allow-Origin': '*',
  'content-type': 'application/json',
  accept: 'application/json'
}

export const chatRequestWithHook = async (req: IChatRequest, beforeFetch: Function, afterFetch: Function): Promise<any> => {

  if (!req.content) {
    console.log('chat content is empty')
    return
  }

  const streamEnable = (req.stream || req.stream === undefined) ? true : false

  const initMessage = req.prompt ? {
    role: 'system',
    content: req.prompt
  } : null

  const headers = {
    ...postHeanders,
    authorization: authorizationPreffix + req.apiKey
  }

  beforeFetch()

  const fetchResponse = await fetch(req.baseUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: req.model,
      messages: initMessage != null ? [
        { ...initMessage },
        {
          role: 'user',
          content: req.content
        }
      ] : [{
        role: 'user',
        content: req.content
      }],
      stream: streamEnable,
      max_tokens: 4096,
      temperature: 0.7,
      top_p: 0.7,
      // top_k: 50,
      // frequency_penalty: 0.5,
      n: 1
    })
  })

  if (!fetchResponse.ok) {
    throw new Error(`HTTP error! Status: ${fetchResponse.status}`);
  }

  afterFetch()

  if (streamEnable) {
    const readableStream = fetchResponse.body?.pipeThrough(new TextDecoderStream()).getReader()
    return readableStream
  }
  return fetchResponse
}

export const chatRequestWithHookV2 = async (req: IChatRequestV2, signal: AbortSignal | null, beforeFetch: Function, afterFetch: Function): Promise<any> => {
  if (!req.messages) {
    console.log('chatRequestWithHookV2 req.messages is empty')
    return
  }

  const headers = {
    ...postHeanders,
    authorization: authorizationPreffix + req.apiKey
  }

  beforeFetch()

  const cacheMessage: BaseChatMessage[] = req.messages.map(
    msg => ({
      role: msg.role,
      content: msg.content,
      ...(msg.name && { name: msg.name })
    })
  )
  const gatherMessages = () => {
    console.log('cacheMessage', cacheMessage);
    let ms = cacheMessage
    if (req.prompt) {
      ms = [
        {
          role: 'system',
          content: req.prompt
        },
        ...ms
      ]
    }
    console.log('req.tools', req.tools);
    if (req.tools && req.tools?.length > 0) {
      const toolsMessage = {
        role: 'user',
        content: JSON.stringify(req.tools)
      }
      ms = [toolsMessage, ...ms]
    }
    console.log('sendTo messages', ms);
    return ms
  }
  const enableStream = req.stream === true ? true : (req.stream === undefined ? true : false)
  const functionTools = req.tools ? req.tools.map(tool => {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema
      }
    }
  }) : []
  const fetchResponse = await fetch(req.baseUrl, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({
      model: req.model,
      messages: gatherMessages(),
      ...(functionTools?.length && { tools: functionTools }),
      stream: enableStream,
      max_tokens: 4096,
      temperature: 0.7,
      top_p: 0.7,
      // top_k: 50,
      // frequency_penalty: 0.5,
      n: 1,
    })
  })

  if (!fetchResponse.ok) {
    const resp = await fetchResponse.json()
    console.log(resp, fetchResponse.statusText)
    throw new Error(`Error=${JSON.stringify(resp)}, Text=${fetchResponse.statusText}`)
  }

  afterFetch()

  return enableStream ? fetchResponse.body?.pipeThrough(new TextDecoderStream()).getReader() : fetchResponse
}

export const commonOpenAIChatCompletionRequest = async (req: IUnifiedRequest, signal: AbortSignal | null, beforeFetch: Function, afterFetch: Function): Promise<any> => {

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
      ...(m.name && { name: m.name })
    }))
  }

  beforeFetch()
  try {
    const fetchResponse = await fetch(req.baseUrl, {
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
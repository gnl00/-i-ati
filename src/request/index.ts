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
        {...initMessage},
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
      frequency_penalty: 0.5,
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

  const systemPromptMessage = req.prompt ? {
    role: 'system',
    content: req.prompt
  } : null

  const headers = {
    ...postHeanders,
    authorization: authorizationPreffix + req.apiKey
  }

  beforeFetch()

  const cacheMessage: ChatMessage[] = req.messages.map(msg => {
    const { reasoning, artifatcs, ...props } = msg
    return props
  })
  const gatherMessages = () => {
    let ms = cacheMessage
    if (systemPromptMessage) {
      ms = [systemPromptMessage, ...cacheMessage]
    }
    if (req.tools) {
      const toolsMessage = {
        role: 'user',
        content: JSON.stringify(req.tools)
      }
      ms = [toolsMessage, ...cacheMessage]
    }
    return ms
  }
  const enableStream = req.stream === true ? true : (req.stream === undefined ? true : false)
  const fetchResponse = await fetch(req.baseUrl, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({
      model: req.model,
      messages: gatherMessages(),
      // tools: req.tools,
      stream: enableStream,
      max_tokens: 4096,
      temperature: 0.7,
      top_p: 0.7,
      // top_k: 50,
      frequency_penalty: 0.5,
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
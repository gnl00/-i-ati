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

  const streamEnable = req.stream ? true : false

  const initMessage = req.prompt ? {
    role: 'user',
    content: req.prompt
  } : null

  const headers = {
    ...postHeanders,
    authorization: authorizationPreffix + req.token
  }

  beforeFetch()

  const fetchResponse = await fetch(req.url, {
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
      max_tokens: 1024,
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

export const chatRequestWithHookV2 = async (req: IChatRequestV2, signal: AbortSignal, beforeFetch: Function, afterFetch: Function): Promise<any> => {

  if (!req.messages) {
    console.log('IChatRequestV2.messages is empty')
    return
  }

  const initMessage = req.prompt ? {
    role: 'user',
    content: req.prompt
  } : null

  const headers = {
    ...postHeanders,
    authorization: authorizationPreffix + req.token
  }

  beforeFetch()

  const cacheMessage: ChatMessage[] = req.messages.map(msg => {
    const { reasoning, ...props } = msg
    return props
  })
  const stream = await fetch(req.url, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({
      model: req.model,
      messages: initMessage != null ? [
        {...initMessage},
        ...cacheMessage
      ] : [...cacheMessage],
      stream: true,
      max_tokens: 1024,
      temperature: 0.7,
      top_p: 0.7,
      // top_k: 50,
      frequency_penalty: 0.5,
      n: 1
    })
  })

  if (!stream.ok) {
    const resp = await stream.json()
    throw new Error(`Error=${JSON.stringify(resp)}, Text=${stream.statusText}`)
  }

  const reader = stream.body?.pipeThrough(new TextDecoderStream()).getReader()

  afterFetch()

  return reader
}
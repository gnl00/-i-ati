const authorizationPreffix = 'Bearer '

// const getHeanders: IHeaders = {}

const postHeanders: IHeaders = {
  'content-type': 'application/json',
  accept: 'application/json'
}

export const translateRequest = async (req: ITranslateRequest) => {
  if (!req.text) {
    console.log('translate text is empty')
    return
  }

  const initMessage = {
    role: 'user',
    content: req.prompt
  }

  const headers = {
    ...postHeanders,
    authorization: authorizationPreffix + req.token
  }

  console.log('request: ', req)
  
  const json = await fetch(req.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: req.model,
      messages: [
        {...initMessage},
        {
          role: 'user',
          content: req.text
        }
      ],
      stream: false,
      max_tokens: 512,
      temperature: 0.7,
      top_p: 0.7,
      top_k: 50,
      frequency_penalty: 0.5,
      n: 1
    })
  }).then(resp => resp.json())
  .catch(err => {
    console.log('translateRequest ERROR', err)
  })

  console.log('json: ', json)

  return json
}

export const translateRequestWithHook = async (req: ITranslateRequest, beforeFetch: Function, afterFetch: Function): Promise<any> => {

  if (!req.text) {
    console.log('translate text is empty')
    return
  }

  const initMessage = {
    role: 'user',
    content: req.prompt
  }

  const headers = {
    ...postHeanders,
    authorization: authorizationPreffix + req.token
  }

  beforeFetch()

  const stream = await fetch(req.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: req.model,
      messages: [
        {...initMessage},
        {
          role: 'user',
          content: req.text
        }
      ],
      stream: true,
      max_tokens: 1024,
      temperature: 0.7,
      top_p: 0.7,
      top_k: 50,
      frequency_penalty: 0.5,
      n: 1
    })
  })

  const reader = stream.body?.pipeThrough(new TextDecoderStream()).getReader()

  afterFetch()

  return reader
}

export const chatRequestWithHook = async (req: IChatRequest, beforeFetch: Function, afterFetch: Function): Promise<any> => {

  if (!req.content) {
    console.log('chat content is empty')
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

  const stream = await fetch(req.url, {
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
      stream: true,
      max_tokens: 1024,
      temperature: 0.7,
      top_p: 0.7,
      top_k: 50,
      frequency_penalty: 0.5,
      n: 1
    })
  })

  if (!stream.ok) {
    throw new Error(`HTTP error! Status: ${stream.status}`);
  }

  const reader = stream.body?.pipeThrough(new TextDecoderStream()).getReader()

  afterFetch()

  return reader
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

  const stream = await fetch(req.url, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({
      model: req.model,
      messages: initMessage != null ? [
        {...initMessage},
        ...req.messages
      ] : [...req.messages],
      stream: true,
      max_tokens: 1024,
      temperature: 0.7,
      top_p: 0.7,
      top_k: 50,
      frequency_penalty: 0.5,
      n: 1
    })
  })

  if (!stream.ok) {
    throw new Error(`Error: status=${stream.status}, message=${stream.statusText}`)
  }

  const reader = stream.body?.pipeThrough(new TextDecoderStream()).getReader()

  afterFetch()

  return reader
}
import { BaseAdapter } from './base'

const normalizeOpenAIToolCalls = (toolCalls: any[] | undefined): any[] | undefined => {
  if (!toolCalls || toolCalls.length === 0) return undefined
  return toolCalls.map(call => {
    if (call?.type === 'function' && call?.function) {
      return {
        id: call.id,
        type: 'function',
        function: {
          name: call.function.name,
          arguments: call.function.arguments ?? ''
        }
      }
    }
    if (call?.name || call?.args) {
      return {
        id: call.id,
        type: 'function',
        function: {
          name: call.name || '',
          arguments: call.args ?? ''
        }
      }
    }
    return call
  })
}

const mapOpenAIMessageFields = (message: ChatMessage): BaseChatMessage => ({
  role: message.role,
  content: message.content,
  ...(message.name && { name: message.name }),
  ...(message.toolCalls && { tool_calls: normalizeOpenAIToolCalls(message.toolCalls) }),
  ...(message.toolCallId && { tool_call_id: message.toolCallId })
})

// OpenAI v1 适配器（兼容 OpenAI API）
export class OpenAIAdapter extends BaseAdapter {
  providerType: ProviderType = 'openai'
  apiVersion = 'v1'

  buildHeaders(req: IUnifiedRequest): Record<string, string> {
    return {
      'content-type': 'application/json',
      'authorization': `Bearer ${req.apiKey}`
    }
  }

  supportsStreamOptionsUsage(): boolean {
    return true
  }

  protected extractUsage(raw: any): ITokenUsage | undefined {
    const usage = raw?.usage
    if (!usage) return undefined
    if (
      typeof usage.prompt_tokens !== 'number' ||
      typeof usage.completion_tokens !== 'number' ||
      typeof usage.total_tokens !== 'number'
    ) {
      return undefined
    }
    return {
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens
    }
  }

  getEndpoint(baseUrl: string): string {
    return `${baseUrl}/chat/completions`
  }

  transformRequest(req: IUnifiedRequest): any {
    const requestBody: any = {
      model: req.model,
      messages: req.messages.map(mapOpenAIMessageFields),
      stream: req.stream ?? true,
      ...(req.options?.maxTokens !== undefined ? { max_tokens: req.options.maxTokens } : {})
    }

    if (req.tools?.length) {
      requestBody.tools = this.transformToolDefinitions(req.tools)
    }

    return requestBody
  }

  transformNotStreamResponse(response: any): IUnifiedResponse {
    const choice = response.choices?.[0]
    if (!choice) {
      throw new Error('Invalid OpenAI response: no choices')
    }

    return {
      id: response.id || 'unknown',
      model: response.model || 'unknown',
      timestamp: response.created ? response.created * 1000 : Date.now(),
      content: choice.message?.content || '',
      toolCalls: this.transformToolCalls(choice.message?.tool_calls),
      finishReason: this.mapFinishReason(choice.finish_reason),
      usage: this.extractUsage(response),
      raw: response
    }
  }

  async *transformStreamResponse(streamReader: ReadableStreamDefaultReader<string>): AsyncGenerator<IUnifiedResponse, void, unknown> {
    if (!streamReader || typeof streamReader.read !== 'function') {
      console.error('Invalid streamReader provided:', streamReader);
      return;
    }

    let buffer = '' // 用于存储不完整的数据

    while (true) {
      const { done, value } = await streamReader.read()
      if (done) {
        break
      }

      // 将新数据追加到缓冲区
      buffer += value

      // 按行分割，但保留最后一个可能不完整的行
      const lines = buffer.split("\n")
      // 最后一行可能不完整，保留在缓冲区中
      buffer = lines.pop() || ''

      for (let line of lines) {
        line = line.trim()
        if (!line) continue

        // 移除 "data: " 前缀
        if (line.startsWith('data: ')) {
          line = line.slice(6)
        }

        if (line === '[DONE]') {
          break
        }

        let respObject: any
        try {
          respObject = JSON.parse(line)
        } catch (e) {
          // 如果无法解析 JSON，忽略这一行（如 OpenRouter 的进度消息）
          // console.warn('Failed to parse line:', line)
          continue
        }

        try {
          // 处理仅包含 usage 的 chunk（choices 为空）
          const usageOnly = (!respObject.choices || respObject.choices.length === 0)
            ? this.extractUsage(respObject)
            : undefined
          if (usageOnly) {
            yield {
              id: respObject.id || 'chatcmpl-' + Date.now(),
              model: respObject.model || 'unknown',
              timestamp: Date.now(),
              content: '',
              finishReason: 'stop',
              usage: usageOnly,
              raw: respObject
            }
            continue
          }

          // 跳过没有 choices 的响应（如内容过滤结果）
          if (!respObject.choices || respObject.choices.length === 0) {
            // console.log('Skipping response without choices:', respObject)
            continue
          }

          const delta = respObject.choices[0]?.delta

          // 跳过没有 delta 的响应
          if (!delta) {
            continue
          }

          const unifiedResponse: IUnifiedResponse = {
            id: respObject.id || 'chatcmpl-' + Date.now(),
            model: respObject.model || 'unknown',
            timestamp: Date.now(),
            content: delta.content || '',
            reasoning: delta.reasoning,
            toolCalls: this.transformToolCalls(delta.tool_calls),
            finishReason: this.mapFinishReason(respObject.choices[0]?.finish_reason),
            usage: this.extractUsage(respObject),
            raw: respObject
          }
          yield unifiedResponse
        } catch (error) {
          console.warn('Failed to parse stream response:', line, error)
        }
      }
    }
  }

  parseStreamChunk(chunk: string): IUnifiedStreamResponse | null {
    try {
      if (chunk.startsWith('data: ')) {
        const jsonStr = chunk.slice(6).trim()
        if (jsonStr === '[DONE]') {
          return null
        }

        const data = JSON.parse(jsonStr)
        const choice = data.choices?.[0]
        if (!choice) {
          const usageOnly = this.extractUsage(data)
          if (usageOnly) {
            return {
              id: data.id || 'stream',
              model: data.model || 'unknown',
              usage: usageOnly,
              raw: data
            }
          }
          return null
        }

        const delta = choice.delta
        return {
          id: data.id || 'stream',
          model: data.model || 'unknown',
          delta: {
            content: delta?.content,
            toolCalls: this.transformToolCalls(delta?.tool_calls),
            finishReason: this.mapFinishReason(choice.finish_reason)
          },
          usage: this.extractUsage(data),
          raw: data
        }
      }
    } catch (error) {
      console.warn('Failed to parse OpenAI stream chunk:', error)
    }
    return null
  }
}

// OpenAI Image1
export class OpenAIImage1Adapter extends BaseAdapter {
  providerType: ProviderType = 'openai'
  apiVersion = 'gpt-image-1'

  buildHeaders(req: IUnifiedRequest): Record<string, string> {
    return {
      'content-type': 'application/json',
      'authorization': `Bearer ${req.apiKey}`
    }
  }

  supportsStreamOptionsUsage(): boolean {
    return false
  }

  getEndpoint(baseUrl: string): string {
    return `${baseUrl}/images/generations`
  }

  transformRequest(req: IUnifiedRequest): any {
    const requestBody: any = {
      model: req.model,
      prompt: req.messages.map(m => {
        const { model, ...msg } = m
        return msg
      })[req.messages.length - 1].content,
      size: "1024x1024",
      n: 1
    }

    return requestBody
  }

  transformStreamResponse(_: ReadableStreamDefaultReader<string>): AsyncGenerator<IUnifiedResponse, void, unknown> {
    throw new Error('Method not supports.')
  }

  transformNotStreamResponse(response: any): IUnifiedResponse {
    console.log('response', response);

    const data = response.data
    if (!data) {
      throw new Error('Invalid OpenAI response: no data')
    }

    return {
      id: response.id || 'unknown',
      model: response.model || 'unknown',
      timestamp: response.created ? response.created * 1000 : Date.now(),
      content: response.data,
      finishReason: "stop",
      raw: response
    }
  }

  parseStreamChunk(chunk: string): IUnifiedStreamResponse | null {
    try {
      if (chunk.startsWith('data: ')) {
        const jsonStr = chunk.slice(6).trim()
        if (jsonStr === '[DONE]') {
          return null
        }

        const data = JSON.parse(jsonStr)
        const choice = data.choices?.[0]
        if (!choice) return null

        const delta = choice.delta
        return {
          id: data.id || 'stream',
          model: data.model || 'unknown',
          delta: {
            content: delta?.content,
            toolCalls: this.transformToolCalls(delta?.tool_calls),
            finishReason: this.mapFinishReason(choice.finish_reason)
          },
          raw: data
        }
      }
    } catch (error) {
      console.warn('Failed to parse OpenAI stream chunk:', error)
    }
    return null
  }
}

import { BaseAdapter } from './base'

// OpenAI v1 适配器（兼容 OpenAI API）
export class OpenAIAdapter extends BaseAdapter {
  providerType: ProviderType = 'openai'
  apiVersion = 'v1'
  
  getEndpoint(baseUrl: string): string {
    return `${baseUrl}/v1/chat/completions`
  }
  
  transformRequest(req: IUnifiedRequest): any {
    const requestBody: any = {
      model: req.model,
      messages: req.messages,
      stream: req.stream ?? true,
      temperature: req.options?.temperature ?? 1,
      max_tokens: req.options?.maxTokens ?? 4096,
      top_p: req.options?.topP ?? 1,
      n: 1
    }
    
    if (req.prompt) {
      requestBody.messages = [
        { role: 'system', content: req.prompt },
        ...requestBody.messages
      ]
    }
    
    if (req.tools?.length) {
      requestBody.tools = this.transformTools(req.tools)
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
      usage: response.usage ? {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens
      } : undefined,
      raw: response
    }
  }

  async *transformStreamResponse(streamReader: ReadableStreamDefaultReader<string>): AsyncGenerator<IUnifiedResponse, void, unknown> {
    if (!streamReader || typeof streamReader.read !== 'function') {
      console.error('Invalid streamReader provided:', streamReader);
      return;
    }

    let buffer = '' // 用于存储不完整的数据

    while(true) {
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

        try {
          const respObject = JSON.parse(line)

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

// OpenAI v2 适配器（通用响应格式）
export class OpenAIV2Adapter extends BaseAdapter {
  providerType: ProviderType = 'openai'
  apiVersion = 'v2'
  
  getEndpoint(baseUrl: string): string {
    return `${baseUrl}/v1/response`
  }
  
  transformRequest(req: IUnifiedRequest): any {
    const requestBody: any = {
      model: req.model,
      input: req.messages,
      stream: req.stream ?? true,
      temperature: req.options?.temperature ?? 1,
      max_output_tokens: req.options?.maxTokens ?? 4096,
      top_p: req.options?.topP ?? 1,
    }
    
    if (req.prompt) {
      requestBody.input = [
        { role: 'system', content: req.prompt },
        ...requestBody.messages
      ]
    }
    
    if (req.tools?.length) {
      requestBody.tools = this.transformTools(req.tools)
    }
    
    return requestBody
  }
  
  transformNotStreamResponse(response: any): IUnifiedResponse {
    // OpenAI v2 使用不同的响应格式
    return {
      id: response.response_id || 'unknown',
      model: response.model || 'unknown',
      timestamp: response.timestamp ? response.timestamp * 1000 : Date.now(),
      content: response.text || response.content || '',
      toolCalls: this.transformToolCalls(response.tool_calls),
      finishReason: this.mapFinishReason(response.finish_reason || response.stop_reason),
      usage: response.usage ? {
        promptTokens: response.usage.prompt_tokens || response.usage.input_tokens,
        completionTokens: response.usage.completion_tokens || response.usage.output_tokens,
        totalTokens: response.usage.total_tokens || 
          (response.usage.input_tokens + response.usage.output_tokens)
      } : undefined,
      raw: response
    }
  }

  async *transformStreamResponse(streamReader: ReadableStreamDefaultReader<string>): AsyncGenerator<IUnifiedResponse, void, unknown> {
    if (!streamReader || typeof streamReader.read !== 'function') {
      console.error('Invalid streamReader provided:', streamReader);
      return;
    }

    let buffer = '' // 用于存储不完整的数据

    while(true) {
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

        const streamResponse = this.parseStreamChunk(line)
        if (streamResponse) {
          const unifiedResponse: IUnifiedResponse = {
            id: streamResponse.id,
            model: streamResponse.model,
            timestamp: Date.now(),
            content: streamResponse.delta?.content || '',
            toolCalls: streamResponse.delta?.toolCalls,
            finishReason: streamResponse.delta?.finishReason || 'stop',
            raw: streamResponse.raw
          }
          yield unifiedResponse
        }
      }
    }
  }
  
  parseStreamChunk(chunk: string): IUnifiedStreamResponse | null {
    try {
      if (chunk.startsWith('data: ')) {
        const jsonStr = chunk.slice(6).trim()
        if (jsonStr === '[DONE]') return null
        
        const data = JSON.parse(jsonStr)
        
        return {
          id: data.response_id || 'stream',
          model: data.model || 'unknown',
          delta: {
            content: data.text || data.delta?.content,
            toolCalls: this.transformToolCalls(data.tool_calls || data.delta?.tool_calls),
            finishReason: this.mapFinishReason(data.finish_reason || data.stop_reason)
          },
          raw: data
        }
      }
    } catch (error) {
      console.warn('Failed to parse OpenAI v2 stream chunk:', error)
    }
    return null
  }
}

// OpenAI Image1
export class OpenAIImage1Adapter extends BaseAdapter {
  providerType: ProviderType = 'openai'
  apiVersion = 'gpt-image-1'
  
  getEndpoint(baseUrl: string): string {
    return `${baseUrl}/v1/images/generations`
  }
  
  transformRequest(req: IUnifiedRequest): any {
    const requestBody: any = {
      model: req.model,
      prompt: req.messages.map(m => {
        const { reasoning, artifatcs, toolCallResults: tool, model, ...msg } = m
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

// OpenAI Image1
export class GoogleOpenAIImageCompatibleAdapter extends BaseAdapter {
  providerType: ProviderType = 'google-openai-compatible'
  apiVersion = 'image'
  
  getEndpoint(baseUrl: string): string {
    return `${baseUrl}/v1/chat/completions`
  }
  
  transformRequest(req: IUnifiedRequest): any {
    const requestBody: any = {
      model: req.model,
      messages: req.messages.map(m => {
        const { reasoning, artifatcs, toolCallResults: tool, model, ...msg } = m
        return msg
      })[req.messages.length - 1],
      stream: true,
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
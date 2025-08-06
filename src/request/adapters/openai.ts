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
    console.log('openai v1 transformStreamResponse', streamReader);
    
    if (!streamReader || typeof streamReader.read !== 'function') {
      console.error('Invalid streamReader provided:', streamReader);
      return;
    }
    
    while(true) {
      const { done, value } = await streamReader.read()
      if (done) {
        break
      }
      const lines = value
      .split("\n")
      .filter((line: string) => line.trim() !== "")
      .map((line: string) => line.replace(/^data: /, ""))

      for (const line of lines) {
        console.log(line)
        if (line === '[DONE]') {
          break
        }
        try {
          const respObject = JSON.parse(line)
          const delta = respObject.choices?.[0]?.delta
          // 实现具体的响应转换逻辑
          const unifiedResponse: IUnifiedResponse = {
            id: respObject.id || 'stream',
            model: respObject.model || 'unknown',
            timestamp: Date.now(),
            content: delta.content || '',
            reasoning: delta.reasoning,
            toolCalls: this.transformToolCalls(respObject.tool_calls),
            finishReason: this.mapFinishReason(respObject.finish_reason),
            raw: respObject
          }
          yield unifiedResponse
        } catch (error) {
          console.warn('Failed to parse stream response:', error)
        }
      }
    }
  }
  
  parseStreamChunk(chunk: string): IUnifiedStreamResponse | null {
    try {
      // OpenAI 流式响应格式: "data: {...}\n\n"
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
      messages: req.messages,
      stream: req.stream ?? true,
      parameters: {
        temperature: req.options?.temperature ?? 0.7,
        max_tokens: req.options?.maxTokens ?? 4096,
        top_p: req.options?.topP ?? 0.7,
        frequency_penalty: 0.5
      }
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
    
    while(true) {
      const { done, value } = await streamReader.read()
      if (done) {
        break
      }
      
      const lines = value
        .split("\n")
        .filter((line: string) => line.trim() !== "")

      for (const line of lines) {
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

// Azure OpenAI 适配器
export class AzureOpenAIAdapter extends BaseAdapter {
  providerType: ProviderType = 'azure-openai'
  apiVersion = 'v1'
  
  getEndpoint(baseUrl: string): string {
    // Azure OpenAI 的端点格式不同，但这里简化处理
    return `${baseUrl}/openai/deployments/gpt-4/chat/completions?api-version=2024-02-15-preview`
  }
  
  getHeaders(req: IUnifiedRequest): Record<string, string> {
    return {
      'api-key': req.apiKey // Azure 使用 api-key 而不是 Authorization
    }
  }
  
  transformRequest(req: IUnifiedRequest): any {
    // Azure OpenAI 的请求格式与 OpenAI 基本相同
    return new OpenAIAdapter().transformRequest(req)
  }
  
  transformNotStreamResponse(response: any): IUnifiedResponse {
    return new OpenAIAdapter().transformNotStreamResponse(response)
  }

  async *transformStreamResponse(streamReader: ReadableStreamDefaultReader<string>): AsyncGenerator<IUnifiedResponse, void, unknown> {
    // 直接使用 OpenAIAdapter 的实现
    const openAIAdapter = new OpenAIAdapter()
    yield* openAIAdapter.transformStreamResponse(streamReader)
  }
  
  parseStreamChunk(chunk: string): IUnifiedStreamResponse | null {
    return new OpenAIAdapter().parseStreamChunk(chunk)
  }
}
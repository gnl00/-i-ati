import { BaseAdapter } from './base'

// OpenAI v1 适配器（兼容 OpenAI API）
export class OpenAIAdapter extends BaseAdapter {
  providerType: ProviderType = 'openai'
  apiVersion = 'v1'
  
  getEndpoint(baseUrl: string): string {
    return `${baseUrl}/v1/chat/completions`
  }
  
  transformRequest(req: IUnifiedChatRequest): any {
    const requestBody: any = {
      model: req.model,
      messages: req.messages,
      stream: req.stream ?? true,
      temperature: req.options?.temperature ?? 0.7,
      max_tokens: req.options?.maxTokens ?? 4096,
      top_p: req.options?.topP ?? 0.7,
      frequency_penalty: 0.5,
      n: 1
    }
    
    // 添加系统提示
    if (req.prompt) {
      requestBody.messages = [
        { role: 'system', content: req.prompt },
        ...requestBody.messages
      ]
    }
    
    // 添加工具调用
    if (req.tools?.length) {
      requestBody.tools = this.transformTools(req.tools)
    }
    
    return requestBody
  }
  
  transformResponse(response: any): IUnifiedResponse {
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
  
  transformRequest(req: IUnifiedChatRequest): any {
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
  
  transformResponse(response: any): IUnifiedResponse {
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
  
  getHeaders(req: IUnifiedChatRequest): Record<string, string> {
    return {
      'api-key': req.apiKey // Azure 使用 api-key 而不是 Authorization
    }
  }
  
  transformRequest(req: IUnifiedChatRequest): any {
    // Azure OpenAI 的请求格式与 OpenAI 基本相同
    return new OpenAIAdapter().transformRequest(req)
  }
  
  transformResponse(response: any): IUnifiedResponse {
    return new OpenAIAdapter().transformResponse(response)
  }
  
  parseStreamChunk(chunk: string): IUnifiedStreamResponse | null {
    return new OpenAIAdapter().parseStreamChunk(chunk)
  }
}
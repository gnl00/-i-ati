import { BaseAdapter } from './base'

// Claude Messages API (v1) 适配器
export class ClaudeAdapter extends BaseAdapter {
  providerType: ProviderType = 'claude'
  apiVersion = 'v1'
  
  getEndpoint(baseUrl: string): string {
    return `${baseUrl}/v1/messages`
  }
  
  getHeaders(req: IUnifiedRequest): Record<string, string> {
    return {
      'x-api-key': req.apiKey // Claude 使用 x-api-key
    }
  }
  
  transformRequest(req: IUnifiedRequest): any {
    // Claude Messages API 的请求格式
    const requestBody: any = {
      model: req.model,
      max_tokens: req.options?.maxTokens ?? 4096,
      temperature: req.options?.temperature ?? 0.7,
      top_p: req.options?.topP ?? 0.7,
      stream: req.stream ?? true,
      messages: this.transformMessages(req.messages, req.prompt)
    }
    
    if (req.tools?.length) {
      requestBody.tools = this.transformClaudeTools(req.tools)
    }
    
    return requestBody
  }
  
  transformNotStreamResponse(response: any): IUnifiedResponse {
    const content = Array.isArray(response.content) 
      ? response.content.find(c => c.type === 'text')?.text || ''
      : response.content || ''
    
    return {
      id: response.id || 'unknown',
      model: response.model || 'claude',
      timestamp: Date.now(),
      content,
      toolCalls: this.transformClaudeToolCalls(response.content),
      finishReason: this.mapFinishReason(response.stop_reason),
      usage: response.usage ? {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens
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
      // Claude 流式响应格式
      if (chunk.startsWith('data: ')) {
        const jsonStr = chunk.slice(6).trim()
        const data = JSON.parse(jsonStr)
        
        if (data.type === 'content_block_delta') {
          return {
            id: 'claude-stream',
            model: 'claude',
            delta: {
              content: data.delta?.text
            },
            raw: data
          }
        } else if (data.type === 'message_stop') {
          return {
            id: 'claude-stream',
            model: 'claude',
            delta: {
              finishReason: 'stop'
            },
            raw: data
          }
        }
      }
    } catch (error) {
      console.warn('Failed to parse Claude stream chunk:', error)
    }
    return null
  }
  
  private transformMessages(messages: ChatMessage[], systemPrompt?: string): any[] {
    const claudeMessages = messages.filter(m => m.role !== 'system').map(msg => ({
      role: msg.role === 'system' ? 'assistant' : msg.role,
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    }))
    
    // Claude 需要单独处理系统提示
    return claudeMessages
  }
  
  private transformClaudeTools(tools: any[]): any[] {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema
    }))
  }
  
  private transformClaudeToolCalls(content: any[]): IToolCall[] | undefined {
    if (!Array.isArray(content)) return undefined
    
    const toolUses = content.filter(c => c.type === 'tool_use')
    if (!toolUses.length) return undefined
    
    return toolUses.map(tu => ({
      id: tu.id || `tool_${Date.now()}`,
      type: 'function' as const,
      function: {
        name: tu.name,
        arguments: JSON.stringify(tu.input)
      }
    }))
  }
}

// Claude Chat Completions API (兼容 OpenAI 格式的 Claude)
export class ClaudeChatAdapter extends BaseAdapter {
  providerType: ProviderType = 'claude'
  apiVersion = 'chat'
  
  getEndpoint(baseUrl: string): string {
    return `${baseUrl}/v1/chat/completions`
  }
  
  getHeaders(req: IUnifiedRequest): Record<string, string> {
    return {
      'anthropic-version': '2023-06-01',
      'x-api-key': req.apiKey
    }
  }
  
  transformRequest(req: IUnifiedRequest): any {
    // 使用类似 OpenAI 的请求格式，但适配 Claude 的特殊需求
    const requestBody: any = {
      model: req.model,
      messages: req.messages,
      stream: req.stream ?? true,
      max_tokens: req.options?.maxTokens ?? 4096,
      temperature: req.options?.temperature ?? 0.7,
      top_p: req.options?.topP ?? 0.7
    }
    
    if (req.prompt) {
      requestBody.messages = [
        { role: 'system', content: req.prompt },
        ...requestBody.messages
      ]
    }
    
    if (req.tools?.length) {
      requestBody.tools = this.transformClaudeTools(req.tools)
    }
    
    return requestBody
  }
  
  transformNotStreamResponse(response: any): IUnifiedResponse {
    // 适配 Claude 聊天完成格式的响应
    const choice = response.choices?.[0]
    if (!choice) {
      throw new Error('Invalid Claude chat response: no choices')
    }
    
    return {
      id: response.id || 'unknown',
      model: response.model || 'claude',
      timestamp: response.created ? response.created * 1000 : Date.now(),
      content: choice.message?.content || '',
      toolCalls: this.transformClaudeToolCalls(choice.message?.tool_calls),
      finishReason: this.mapFinishReason(choice.finish_reason),
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
        const choice = data.choices?.[0]
        if (!choice) return null
        
        const delta = choice.delta
        return {
          id: data.id || 'claude-chat-stream',
          model: data.model || 'claude',
          delta: {
            content: delta?.content,
            toolCalls: this.transformClaudeToolCalls(delta?.tool_calls),
            finishReason: this.mapFinishReason(choice.finish_reason)
          },
          raw: data
        }
      }
    } catch (error) {
      console.warn('Failed to parse Claude chat stream chunk:', error)
    }
    return null
  }
  
  private transformClaudeTools(tools: any[]): any[] {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema
    }))
  }
  
  private transformClaudeToolCalls(toolCalls: any[]): IToolCall[] | undefined {
    if (!toolCalls?.length) return undefined
    
    return toolCalls.map(tc => ({
      id: tc.id || `tool_${Date.now()}`,
      type: 'function' as const,
      function: {
        name: tc.function?.name || tc.name,
        arguments: tc.function?.arguments || JSON.stringify(tc.input)
      }
    }))
  }
}

// Claude Legacy API (兼容性适配器)
export class ClaudeLegacyAdapter extends BaseAdapter {
  providerType: ProviderType = 'claude'
  apiVersion = 'legacy'
  
  getEndpoint(baseUrl: string): string {
    return `${baseUrl}/v1/complete`
  }
  
  transformRequest(req: IUnifiedRequest): any {
    // 转换为 Claude Legacy API 格式
    const prompt = this.buildPrompt(req.messages, req.prompt)
    
    return {
      model: req.model,
      prompt,
      max_tokens_to_sample: req.options?.maxTokens ?? 4096,
      temperature: req.options?.temperature ?? 0.7,
      top_p: req.options?.topP ?? 0.7,
      stream: req.stream ?? true
    }
  }
  
  transformNotStreamResponse(response: any): IUnifiedResponse {
    return {
      id: 'claude-legacy-' + Date.now(),
      model: response.model || 'claude',
      timestamp: Date.now(),
      content: response.completion || '',
      finishReason: this.mapFinishReason(response.stop_reason),
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
      const data = JSON.parse(chunk)
      return {
        id: 'claude-legacy-stream',
        model: data.model || 'claude',
        delta: {
          content: data.completion,
          finishReason: this.mapFinishReason(data.stop_reason)
        },
        raw: data
      }
    } catch (error) {
      console.warn('Failed to parse Claude legacy stream chunk:', error)
    }
    return null
  }
  
  private buildPrompt(messages: ChatMessage[], systemPrompt?: string): string {
    let prompt = systemPrompt ? `${systemPrompt}\n\n` : ''
    
    messages.forEach(msg => {
      if (msg.role === 'user') {
        prompt += `Human: ${typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}\n\n`
      } else if (msg.role === 'assistant' || msg.role === 'system') {
        prompt += `Assistant: ${typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}\n\n`
      }
    })
    
    prompt += 'Assistant:'
    return prompt
  }
}
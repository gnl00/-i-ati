import { BaseAdapter } from './base'

const extractSseDataChunks = (buffer: string): { chunks: string[]; remaining: string } => {
  const events = buffer.split(/\r?\n\r?\n/)
  const remaining = events.pop() ?? ''
  const chunks: string[] = []

  for (const eventText of events) {
    const dataLines = eventText
      .split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart())

    if (dataLines.length === 0) continue
    chunks.push(`data: ${dataLines.join('\n')}`)
  }

  return { chunks, remaining }
}

interface ClaudeToolUseState {
  id: string
  name: string
  index: number
  partialJson: string
  initialInput?: unknown
}

// Claude Messages API (v1) 适配器
export class ClaudeAdapter extends BaseAdapter {
  providerType: ProviderType = 'claude'
  apiVersion = 'v1'
  private streamMessageId = 'claude-stream'
  private streamModel = 'claude'
  private pendingToolUses = new Map<number, ClaudeToolUseState>()
  private streamLastFinishReason: IUnifiedResponse['finishReason'] | null = null

  supportsStreamOptionsUsage(): boolean {
    return false
  }

  protected extractUsage(raw: any): ITokenUsage | undefined {
    const usage = raw?.usage
    if (!usage) return undefined
    if (typeof usage.input_tokens !== 'number' || typeof usage.output_tokens !== 'number') {
      return undefined
    }
    return {
      promptTokens: usage.input_tokens,
      completionTokens: usage.output_tokens,
      totalTokens: usage.input_tokens + usage.output_tokens
    }
  }

  getEndpoint(baseUrl: string): string {
    return `${baseUrl}/messages`
  }

  buildHeaders(req: IUnifiedRequest): Record<string, string> {
    return {
      'content-type': 'application/json',
      'x-api-key': req.apiKey // Claude 使用 x-api-key
    }
  }

  transformRequest(req: IUnifiedRequest): any {
    const { systemPrompt, messages } = this.transformClaudeMessages(req.messages)

    const requestBody: any = {
      model: req.model,
      stream: req.stream ?? true,
      messages: messages,
      ...(req.options?.maxTokens !== undefined ? { max_tokens: req.options.maxTokens } : {})
    }

    // Claude API requires system prompts in separate 'system' field
    // System prompts are extracted from messages by RequestMessageBuilder
    if (systemPrompt) {
      requestBody.system = systemPrompt
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
      usage: this.extractUsage(response),
      raw: response
    }
  }

  async *transformStreamResponse(streamReader: ReadableStreamDefaultReader<string>): AsyncGenerator<IUnifiedResponse, void, unknown> {
    if (!streamReader || typeof streamReader.read !== 'function') {
      console.error('Invalid streamReader provided:', streamReader);
      return;
    }

    this.resetStreamState()
    let sseBuffer = ''

    while (true) {
      const { done, value } = await streamReader.read()
      if (done) {
        break
      }

      sseBuffer += value
      const { chunks, remaining } = extractSseDataChunks(sseBuffer)
      sseBuffer = remaining

      for (const chunk of chunks) {
        const streamResponse = this.parseStreamChunk(chunk)
        if (streamResponse) {
          const unifiedResponse: IUnifiedResponse = {
            id: streamResponse.id,
            model: streamResponse.model,
            timestamp: Date.now(),
            content: streamResponse.delta?.content || '',
            reasoning: streamResponse.delta?.reasoning,
            toolCalls: streamResponse.delta?.toolCalls,
            finishReason: streamResponse.delta?.finishReason || 'stop',
            raw: streamResponse.raw
          }
          yield unifiedResponse
        }
      }
    }

    if (sseBuffer.trim() !== '') {
      const { chunks } = extractSseDataChunks(`${sseBuffer}\n\n`)
      for (const chunk of chunks) {        
        const streamResponse = this.parseStreamChunk(chunk)
        if (!streamResponse) continue
        const unifiedResponse: IUnifiedResponse = {
          id: streamResponse.id,
          model: streamResponse.model,
          timestamp: Date.now(),
          content: streamResponse.delta?.content || '',
          reasoning: streamResponse.delta?.reasoning,
          toolCalls: streamResponse.delta?.toolCalls,
          finishReason: streamResponse.delta?.finishReason || 'stop',
          raw: streamResponse.raw
        }
        yield unifiedResponse
      }
    }
  }

  parseStreamChunk(chunk: string): IUnifiedStreamResponse | null {
    try {
      // Claude 流式响应格式
      if (chunk.startsWith('data: ')) {
        const jsonStr = chunk.slice(6).trim()
        if (jsonStr === '[DONE]') return null
        const data = JSON.parse(jsonStr)

        if (data.type === 'message_start') {
          this.streamMessageId = data.message?.id || this.streamMessageId
          this.streamModel = data.message?.model || this.streamModel
          this.streamLastFinishReason = null
          return null
        }

        if (data.type === 'content_block_start') {
          const contentBlock = data.content_block
          if (contentBlock?.type === 'tool_use') {
            const index = typeof data.index === 'number' ? data.index : -1
            this.pendingToolUses.set(index, {
              id: contentBlock.id || `tool_${Date.now()}`,
              name: contentBlock.name || '',
              index,
              partialJson: '',
              initialInput: contentBlock.input
            })
          }
          return null
        }

        if (data.type === 'content_block_delta') {
          if (data.delta?.type === 'input_json_delta') {
            const index = typeof data.index === 'number' ? data.index : -1
            const toolUseState = this.pendingToolUses.get(index)
            if (toolUseState) {
              toolUseState.partialJson += data.delta.partial_json || ''
            }
            return null
          }

          return {
            id: this.streamMessageId,
            model: this.streamModel,
            delta: {
              content: data.delta?.text,
              reasoning: data.delta?.thinking
            },
            raw: data
          }
        }

        if (data.type === 'content_block_stop') {
          const index = typeof data.index === 'number' ? data.index : -1
          const toolUseState = this.pendingToolUses.get(index)
          if (!toolUseState) return null

          this.pendingToolUses.delete(index)
          const toolArguments = this.buildToolArguments(toolUseState)
          return {
            id: this.streamMessageId,
            model: this.streamModel,
            delta: {
              toolCalls: [{
                id: toolUseState.id,
                index: toolUseState.index,
                type: 'function',
                function: {
                  name: toolUseState.name,
                  arguments: toolArguments
                }
              }]
            },
            raw: data
          }
        }

        if (data.type === 'message_delta') {
          const stopReason = this.mapFinishReason(data.delta?.stop_reason)
          if (!data.delta?.stop_reason) return null
          this.streamLastFinishReason = stopReason
          return {
            id: this.streamMessageId,
            model: this.streamModel,
            delta: {
              finishReason: stopReason
            },
            usage: this.extractUsage(data),
            raw: data
          }
        }

        if (data.type === 'message_stop') {
          // message_stop is just the end marker for one message in Claude SSE.
          // If stop_reason was already emitted via message_delta, suppress duplicate finish signal.
          if (this.streamLastFinishReason) {
            this.pendingToolUses.clear()
            return null
          }
          return {
            id: this.streamMessageId,
            model: this.streamModel,
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

  private resetStreamState(): void {
    this.streamMessageId = 'claude-stream'
    this.streamModel = 'claude'
    this.streamLastFinishReason = null
    this.pendingToolUses.clear()
  }

  private buildToolArguments(toolUseState: ClaudeToolUseState): string {
    const partial = toolUseState.partialJson.trim()
    if (partial) {
      try {
        return JSON.stringify(JSON.parse(partial))
      } catch {
        return partial
      }
    }
    if (toolUseState.initialInput && typeof toolUseState.initialInput === 'object') {
      return JSON.stringify(toolUseState.initialInput)
    }
    return '{}'
  }

  /**
   * Convert internal chat messages into Claude Messages API format.
   * - system prompt => requestBody.system
   * - assistant.toolCalls => assistant.content tool_use blocks
   * - role=tool => user.content tool_result block
   */
  private transformClaudeMessages(messages: ChatMessage[]): { systemPrompt: string | null; messages: any[] } {
    const systemMessages: string[] = []
    const claudeMessages: any[] = []

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemMessages.push(typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content))
        continue
      }

      if (msg.role === 'tool') {
        if (!msg.toolCallId) {
          continue
        }
        claudeMessages.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: msg.toolCallId,
            content: this.toClaudeText(msg.content)
          }]
        })
        continue
      }

      if (msg.role === 'assistant') {
        const contentBlocks: any[] = []
        const textContent = this.toClaudeText(msg.content)
        if (textContent.length > 0) {
          contentBlocks.push({ type: 'text', text: textContent })
        }
        if (msg.toolCalls?.length) {
          msg.toolCalls.forEach((toolCall, index) => {
            contentBlocks.push({
              type: 'tool_use',
              id: toolCall.id || `tool_${Date.now()}_${index}`,
              name: toolCall.function?.name || '',
              input: this.parseToolInput(toolCall.function?.arguments)
            })
          })
        }
        claudeMessages.push({
          role: 'assistant',
          content: contentBlocks.length > 0 ? contentBlocks : ''
        })
        continue
      }

      claudeMessages.push({
        role: 'user',
        content: this.toClaudeText(msg.content)
      })
    }

    return {
      systemPrompt: systemMessages.length > 0 ? systemMessages.join('\n\n') : null,
      messages: claudeMessages
    }
  }

  private toClaudeText(content: ChatMessage['content']): string {
    if (typeof content === 'string') {
      return content
    }
    if (Array.isArray(content)) {
      return content
        .map(item => (typeof item === 'string' ? item : (item as any)?.text || ''))
        .join('\n')
    }
    return ''
  }

  private parseToolInput(rawArgs: string | undefined): Record<string, any> {
    if (!rawArgs || rawArgs.trim() === '') {
      return {}
    }
    try {
      const parsed = JSON.parse(rawArgs)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed
      }
      return { value: parsed }
    } catch {
      return { raw: rawArgs }
    }
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

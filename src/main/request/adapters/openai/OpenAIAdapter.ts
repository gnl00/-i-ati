import { BaseAdapter } from '../base'

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

export class OpenAIAdapter extends BaseAdapter {
  providerType: ProviderType = 'openai'

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

  buildRequest(req: IUnifiedRequest): any {
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

  parseResponse(response: any): IUnifiedResponse {
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

  parseStreamResponse(chunk: string): IUnifiedStreamResponse | null {
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

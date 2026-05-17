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

const toFiniteNumber = (value: unknown): number | undefined => (
  typeof value === 'number' && Number.isFinite(value) ? value : undefined
)

type OpenAIRequestMessage = BaseChatMessage & {
  reasoning_content?: string
  tool_calls?: any[]
  tool_call_id?: string
}

const mapOpenAIMessageFields = (
  message: UnifiedRequestMessage,
  options: { includeReasoningContent: boolean }
): OpenAIRequestMessage => ({
  role: message.role,
  content: message.content,
  ...(options.includeReasoningContent && message.role === 'assistant' && message.reasoning
    ? { reasoning_content: message.reasoning }
    : {}),
  ...(message.role === 'assistant' && message.toolCalls
    ? { tool_calls: normalizeOpenAIToolCalls(message.toolCalls) }
    : {}),
  ...(message.role === 'tool' ? { tool_call_id: message.toolCallId } : {})
})

const buildOpenAIMessages = (req: IUnifiedRequest): OpenAIRequestMessage[] => {
  const includeReasoningContent = Boolean(
    req.options?.thinkingLevel && req.options.thinkingLevel !== 'none'
  )
  const messages = req.messages.map((message) => mapOpenAIMessageFields(message, {
    includeReasoningContent
  }))
  if (!req.systemPrompt) {
    return messages
  }

  return [{
    role: 'system',
    content: req.systemPrompt
  }, ...messages]
}

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

  getThinkingLevels(): ThinkingLevel[] {
    return ['none', 'minimal', 'low', 'medium', 'high', 'xhigh']
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

    const promptCacheHitTokens = toFiniteNumber(usage.prompt_cache_hit_tokens)
      ?? toFiniteNumber(usage.prompt_tokens_details?.cached_tokens)
    const promptCacheMissTokens = toFiniteNumber(usage.prompt_cache_miss_tokens)
      ?? (
        promptCacheHitTokens !== undefined
          ? Math.max(0, usage.prompt_tokens - promptCacheHitTokens)
          : undefined
      )
    const promptCacheWriteTokens = toFiniteNumber(usage.prompt_cache_write_tokens)
      ?? toFiniteNumber(usage.prompt_tokens_details?.cache_write_tokens)
    const reasoningTokens = toFiniteNumber(usage.completion_tokens_details?.reasoning_tokens)

    const tokenUsage: ITokenUsage = {
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens
    }
    if (promptCacheHitTokens !== undefined) tokenUsage.promptCacheHitTokens = promptCacheHitTokens
    if (promptCacheMissTokens !== undefined) tokenUsage.promptCacheMissTokens = promptCacheMissTokens
    if (promptCacheWriteTokens !== undefined) tokenUsage.promptCacheWriteTokens = promptCacheWriteTokens
    if (reasoningTokens !== undefined) tokenUsage.reasoningTokens = reasoningTokens

    return tokenUsage
  }

  getEndpoint(baseUrl: string): string {
    return `${baseUrl}/chat/completions`
  }

  buildRequest(req: IUnifiedRequest): any {
    const requestBody: any = {
      model: req.model,
      messages: buildOpenAIMessages(req),
      stream: req.stream ?? true,
      ...(req.options?.maxTokens !== undefined ? { max_tokens: req.options.maxTokens } : {})
    }

    if (req.tools?.length) {
      requestBody.tools = this.transformToolDefinitions(req.tools)
    }

    if (req.options?.thinkingLevel && this.getThinkingLevels().includes(req.options.thinkingLevel)) {
      requestBody.reasoning_effort = req.options.thinkingLevel
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
      reasoning: choice.message?.reasoning_content ?? choice.message?.reasoning,
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
            reasoning: delta?.reasoning_content ?? delta?.reasoning,
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

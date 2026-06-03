import { describe, expect, it, vi } from 'vitest'
import { OpenAIAdapter } from '../openai'
import { TOOL_CALL_REASON_PARAMETER_NAME } from '@shared/tools/definitions-utils'
import { createTestUnifiedRequest } from '../../__tests__/helpers'

vi.mock('@main/db/config', () => ({
  configDb: {
    getConfig: vi.fn(() => ({ tools: {} }))
  }
}))

describe('OpenAIAdapter request mapping', () => {
  it('maps thinking level to chat completions reasoning_effort', () => {
    const adapter = new OpenAIAdapter()

    const requestBody = adapter.buildRequest(createTestUnifiedRequest({
      adapterPluginId: 'openai-chat-compatible-adapter',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-5',
      options: {
        thinking: {
          enabled: true,
          effort: 'high'
        }
      }
    }))

    expect(adapter.getThinkingLevels()).toEqual(['none', 'minimal', 'low', 'medium', 'high', 'xhigh'])
    expect(requestBody.reasoning_effort).toBe('high')
    expect(requestBody.reasoning).toBeUndefined()
  })

  it('disables DeepSeek thinking when thinking is disabled', () => {
    const adapter = new OpenAIAdapter()

    const requestBody = adapter.buildRequest(createTestUnifiedRequest({
      adapterPluginId: 'openai-chat-compatible-adapter',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-v4-flash',
      messages: [{
        role: 'assistant',
        content: 'previous answer',
        reasoning: 'previous reasoning'
      }],
      options: {
        thinking: {
          enabled: false
        }
      }
    }))

    expect(requestBody.thinking).toEqual({ type: 'disabled' })
    expect(requestBody.reasoning_effort).toBeUndefined()
    expect(requestBody.messages[0]).not.toHaveProperty('reasoning_content')
  })

  it('maps DeepSeek enabled thinking and max effort to OpenAI-compatible fields', () => {
    const adapter = new OpenAIAdapter()

    const requestBody = adapter.buildRequest(createTestUnifiedRequest({
      adapterPluginId: 'openai-chat-compatible-adapter',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-v4-flash',
      options: {
        thinking: {
          enabled: true,
          effort: 'max'
        }
      }
    }))

    expect(requestBody.thinking).toEqual({ type: 'enabled' })
    expect(requestBody.reasoning_effort).toBe('max')
  })

  it('replays assistant reasoning_content for thinking chat completions', () => {
    const adapter = new OpenAIAdapter()

    const requestBody = adapter.buildRequest(createTestUnifiedRequest({
      adapterPluginId: 'openai-chat-compatible-adapter',
      baseUrl: 'https://api.openai.com/v1',
      model: 'mimo-v2.5-pro',
      messages: [
        {
          role: 'assistant',
          content: 'previous answer',
          reasoning: 'previous reasoning',
          toolCalls: [{
            id: 'call-1',
            type: 'function',
            function: {
              name: 'read',
              arguments: '{"file_path":"src/main/resources/logback-plus.xml"}'
            }
          }],
        },
        {
          role: 'user',
          content: 'continue'
        }
      ],
      options: {
        thinking: {
          enabled: true,
          effort: 'high'
        }
      }
    }))

    expect(requestBody.messages[0]).toEqual(expect.objectContaining({
      role: 'assistant',
      content: 'previous answer',
      reasoning_content: 'previous reasoning',
      tool_calls: [expect.objectContaining({
        id: 'call-1',
        function: expect.objectContaining({
          name: 'read'
        })
      })]
    }))
    expect(requestBody.messages[1]).not.toHaveProperty('reasoning_content')
  })

  it('keeps assistant reasoning out of regular chat completions requests', () => {
    const adapter = new OpenAIAdapter()

    const requestBody = adapter.buildRequest(createTestUnifiedRequest({
      adapterPluginId: 'openai-chat-compatible-adapter',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4.1',
      messages: [{
        role: 'assistant',
        content: 'previous answer',
        reasoning: 'previous reasoning'
      }]
    }))

    expect(requestBody.messages[0]).not.toHaveProperty('reasoning_content')
  })

  it('maps tool result messages without leaking provider-neutral toolName', () => {
    const adapter = new OpenAIAdapter()

    const requestBody = adapter.buildRequest(createTestUnifiedRequest({
      adapterPluginId: 'openai-chat-compatible-adapter',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4.1',
      messages: [{
        role: 'tool',
        content: 'tool output',
        toolCallId: 'tool-1',
        toolName: 'read'
      }]
    }))

    expect(requestBody.messages[0]).toEqual({
      role: 'tool',
      content: 'tool output',
      tool_call_id: 'tool-1'
    })
  })

  it('requires tool_call_reason in chat completions tool schemas', () => {
    const adapter = new OpenAIAdapter()

    const requestBody = adapter.buildRequest(createTestUnifiedRequest({
      adapterPluginId: 'openai-chat-compatible-adapter',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-5',
      tools: [{
        name: 'search',
        description: 'Search',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' }
          },
          required: ['query']
        }
      }]
    }))

    const parameters = requestBody.tools[0].function.parameters
    expect(parameters.properties[TOOL_CALL_REASON_PARAMETER_NAME]).toEqual(expect.objectContaining({
      type: 'string',
      description: expect.stringContaining('same language the user is currently using')
    }))
    expect(parameters.required).toEqual(['query', TOOL_CALL_REASON_PARAMETER_NAME])
  })

  it('extracts prompt cache and reasoning usage from stream chunks', () => {
    const adapter = new OpenAIAdapter()

    const chunk = adapter.parseStreamResponse(`data: ${JSON.stringify({
      id: 'resp-usage',
      model: 'deepseek-v4-flash',
      choices: [],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 20,
        total_tokens: 120,
        prompt_cache_hit_tokens: 80,
        prompt_cache_miss_tokens: 20,
        completion_tokens_details: {
          reasoning_tokens: 7
        }
      }
    })}`)

    expect(chunk?.usage).toEqual({
      promptTokens: 100,
      completionTokens: 20,
      totalTokens: 120,
      promptCacheHitTokens: 80,
      promptCacheMissTokens: 20,
      reasoningTokens: 7
    })
  })

  it('derives prompt cache miss tokens from cached token details', () => {
    const adapter = new OpenAIAdapter()

    const chunk = adapter.parseStreamResponse(`data: ${JSON.stringify({
      id: 'resp-usage',
      model: 'deepseek-v4-flash',
      choices: [{
        index: 0,
        delta: {},
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 20,
        total_tokens: 120,
        prompt_tokens_details: {
          cached_tokens: 64
        }
      }
    })}`)

    expect(chunk?.usage).toEqual({
      promptTokens: 100,
      completionTokens: 20,
      totalTokens: 120,
      promptCacheHitTokens: 64,
      promptCacheMissTokens: 36
    })
  })
})

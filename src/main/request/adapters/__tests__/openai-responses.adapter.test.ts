import { describe, expect, it, vi } from 'vitest'
import { OpenAIResponsesAdapter } from '../openai'
import { TOOL_CALL_REASON_PARAMETER_NAME } from '@shared/tools/definitions-utils'
import { createTestUnifiedRequest } from '../../__tests__/helpers'

vi.mock('@main/db/config', () => ({
  configDb: {
    getConfig: vi.fn(() => ({ tools: {} }))
  }
}))

const toDataChunk = (payload: Record<string, any>): string => `data: ${JSON.stringify(payload)}`

describe('OpenAIResponsesAdapter request mapping', () => {
  it('maps unified chat input to Responses API input and reasoning fields', () => {
    const adapter = new OpenAIResponsesAdapter()

    const requestBody = adapter.buildRequest(createTestUnifiedRequest({
      adapterPluginId: 'openai-responses-compatible-adapter',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-5',
      systemPrompt: 'You are concise.',
      messages: [
        {
          role: 'user',
          content: 'hello'
        },
        {
          role: 'assistant',
          content: 'I need a tool.',
          toolCalls: [{
            id: 'call-1',
            type: 'function',
            function: {
              name: 'search',
              arguments: '{"query":"weather"}'
            }
          }]
        },
        {
          role: 'tool',
          content: '{"temperature":21}',
          toolCallId: 'call-1',
          toolName: 'search'
        }
      ],
      options: {
        maxTokens: 512,
        thinking: {
          enabled: true,
          effort: 'high'
        }
      }
    }))

    expect(adapter.getEndpoint('https://api.openai.com/v1')).toBe('https://api.openai.com/v1/responses')
    expect(requestBody.instructions).toBe('You are concise.')
    expect(requestBody.max_output_tokens).toBe(512)
    expect(requestBody.reasoning).toEqual({ effort: 'high' })
    expect(requestBody.input).toEqual([
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'hello' }]
      },
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'input_text', text: 'I need a tool.' }]
      },
      {
        type: 'function_call',
        call_id: 'call-1',
        name: 'search',
        arguments: '{"query":"weather"}'
      },
      {
        type: 'function_call_output',
        call_id: 'call-1',
        output: '{"temperature":21}'
      }
    ])
  })

  it('requires tool_call_reason in Responses tool schemas', () => {
    const adapter = new OpenAIResponsesAdapter()

    const requestBody = adapter.buildRequest(createTestUnifiedRequest({
      adapterPluginId: 'openai-responses-compatible-adapter',
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

    const parameters = requestBody.tools[0].parameters
    expect(parameters.properties[TOOL_CALL_REASON_PARAMETER_NAME]).toEqual(expect.objectContaining({
      type: 'string'
    }))
    expect(parameters.required).toEqual(['query', TOOL_CALL_REASON_PARAMETER_NAME])
  })
})

describe('OpenAIResponsesAdapter response parsing', () => {
  it('parses non-stream output text, reasoning, tool calls, and usage', () => {
    const adapter = new OpenAIResponsesAdapter()

    const response = adapter.parseResponse({
      id: 'resp-1',
      model: 'gpt-5',
      created_at: 1710000000,
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: 'hello' }]
        },
        {
          type: 'reasoning',
          summary: [{ type: 'summary_text', text: 'reasoned' }]
        },
        {
          type: 'function_call',
          call_id: 'call-1',
          name: 'search',
          arguments: '{"query":"weather"}'
        }
      ],
      usage: {
        input_tokens: 10,
        output_tokens: 4,
        total_tokens: 14
      }
    })

    expect(response).toEqual(expect.objectContaining({
      id: 'resp-1',
      model: 'gpt-5',
      content: 'hello',
      reasoning: 'reasoned',
      finishReason: 'tool_calls',
      usage: {
        promptTokens: 10,
        completionTokens: 4,
        totalTokens: 14
      }
    }))
    expect(response.toolCalls?.[0]?.function.name).toBe('search')
  })

  it('parses stream text deltas, tool calls, and completed usage', () => {
    const adapter = new OpenAIResponsesAdapter()

    const textChunk = adapter.parseStreamResponse(toDataChunk({
      type: 'response.output_text.delta',
      item_id: 'item-1',
      delta: 'hel'
    }))
    const toolChunk = adapter.parseStreamResponse(toDataChunk({
      type: 'response.output_item.done',
      item: {
        type: 'function_call',
        call_id: 'call-1',
        name: 'search',
        arguments: '{"query":"weather"}'
      }
    }))
    const completedChunk = adapter.parseStreamResponse(toDataChunk({
      type: 'response.completed',
      response: {
        id: 'resp-1',
        model: 'gpt-5',
        usage: {
          input_tokens: 10,
          output_tokens: 4,
          total_tokens: 14
        }
      }
    }))

    expect(textChunk?.delta?.content).toBe('hel')
    expect(toolChunk?.delta?.finishReason).toBe('tool_calls')
    expect(toolChunk?.delta?.toolCalls?.[0]?.function.name).toBe('search')
    expect(completedChunk?.delta?.finishReason).toBe('stop')
    expect(completedChunk?.usage).toEqual({
      promptTokens: 10,
      completionTokens: 4,
      totalTokens: 14
    })
  })
})

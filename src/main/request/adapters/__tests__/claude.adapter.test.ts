import { describe, expect, it, vi } from 'vitest'
import { ClaudeAdapter } from '../claude'
import { TOOL_CALL_REASON_PARAMETER_NAME } from '@shared/tools/definitions-utils'
import { createTestUnifiedRequest } from '../../__tests__/helpers'

vi.mock('@main/db/config', () => ({
  configDb: {
    getConfig: vi.fn(() => ({ tools: {} }))
  }
}))

const toDataChunk = (payload: Record<string, any>): string => `data: ${JSON.stringify(payload)}`

describe('ClaudeAdapter tool use parsing', () => {
  it('parses single tool call with fragmented input_json_delta and suppresses duplicate message_stop finish', () => {
    const adapter = new ClaudeAdapter()

    adapter.parseStreamResponse(toDataChunk({
      type: 'message_start',
      message: { id: 'msg-1', model: 'claude-haiku' }
    }))

    expect(adapter.parseStreamResponse(toDataChunk({
      type: 'content_block_start',
      index: 1,
      content_block: { type: 'tool_use', id: 'tool_1', name: 'memory_retrieval', input: {} }
    }))).toBeNull()

    expect(adapter.parseStreamResponse(toDataChunk({
      type: 'content_block_delta',
      index: 1,
      delta: { type: 'input_json_delta', partial_json: '{"quer' }
    }))).toBeNull()
    expect(adapter.parseStreamResponse(toDataChunk({
      type: 'content_block_delta',
      index: 1,
      delta: { type: 'input_json_delta', partial_json: 'y":"moltb' }
    }))).toBeNull()
    expect(adapter.parseStreamResponse(toDataChunk({
      type: 'content_block_delta',
      index: 1,
      delta: { type: 'input_json_delta', partial_json: 'ook"}' }
    }))).toBeNull()

    const toolCallChunk = adapter.parseStreamResponse(toDataChunk({
      type: 'content_block_stop',
      index: 1
    }))
    expect(toolCallChunk?.delta?.toolCalls?.[0]?.function?.name).toBe('memory_retrieval')
    expect(toolCallChunk?.delta?.toolCalls?.[0]?.function?.arguments).toBe('{"query":"moltbook"}')

    const stopReasonChunk = adapter.parseStreamResponse(toDataChunk({
      type: 'message_delta',
      delta: { stop_reason: 'tool_use', stop_sequence: null },
      usage: {
        input_tokens: 10,
        output_tokens: 1,
        cache_read_input_tokens: 4,
        cache_creation_input_tokens: 2
      }
    }))
    expect(stopReasonChunk?.delta?.finishReason).toBe('tool_calls')
    expect(stopReasonChunk?.usage).toEqual({
      promptTokens: 10,
      completionTokens: 1,
      totalTokens: 11,
      promptCacheHitTokens: 4,
      promptCacheMissTokens: 4,
      promptCacheWriteTokens: 2
    })

    const messageStopChunk = adapter.parseStreamResponse(toDataChunk({ type: 'message_stop' }))
    expect(messageStopChunk).toBeNull()
  })

  it('parses parallel tool calls by block index without arg cross-over', () => {
    const adapter = new ClaudeAdapter()
    adapter.parseStreamResponse(toDataChunk({
      type: 'message_start',
      message: { id: 'msg-2', model: 'claude-sonnet' }
    }))

    adapter.parseStreamResponse(toDataChunk({
      type: 'content_block_start',
      index: 2,
      content_block: { type: 'tool_use', id: 'tool_2', name: 'tool_b', input: {} }
    }))
    adapter.parseStreamResponse(toDataChunk({
      type: 'content_block_start',
      index: 1,
      content_block: { type: 'tool_use', id: 'tool_1', name: 'tool_a', input: {} }
    }))

    adapter.parseStreamResponse(toDataChunk({
      type: 'content_block_delta',
      index: 2,
      delta: { type: 'input_json_delta', partial_json: '{"k":"B"}' }
    }))
    adapter.parseStreamResponse(toDataChunk({
      type: 'content_block_delta',
      index: 1,
      delta: { type: 'input_json_delta', partial_json: '{"k":"A"}' }
    }))

    const firstStopped = adapter.parseStreamResponse(toDataChunk({
      type: 'content_block_stop',
      index: 1
    }))
    const secondStopped = adapter.parseStreamResponse(toDataChunk({
      type: 'content_block_stop',
      index: 2
    }))

    expect(firstStopped?.delta?.toolCalls?.[0]?.function?.name).toBe('tool_a')
    expect(firstStopped?.delta?.toolCalls?.[0]?.function?.arguments).toBe('{"k":"A"}')
    expect(secondStopped?.delta?.toolCalls?.[0]?.function?.name).toBe('tool_b')
    expect(secondStopped?.delta?.toolCalls?.[0]?.function?.arguments).toBe('{"k":"B"}')
  })
})

describe('ClaudeAdapter request mapping', () => {
  it('serializes image_url parts into Claude image content blocks', () => {
    const adapter = new ClaudeAdapter()
    const requestBody = adapter.buildRequest(createTestUnifiedRequest({
      adapterPluginId: 'claude-compatible-adapter',
      baseUrl: 'https://api.anthropic.com/v1',
      model: 'claude-haiku',
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: 'data:image/png;base64,abc123',
              detail: 'auto'
            }
          },
          {
            type: 'image_url',
            image_url: {
              url: 'https://cdn.example/image.jpg',
              detail: 'high'
            }
          },
          {
            type: 'text',
            text: 'Describe these images.'
          }
        ]
      }]
    }))

    expect(requestBody.messages[0]).toEqual({
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: 'abc123'
          }
        },
        {
          type: 'image',
          source: {
            type: 'url',
            url: 'https://cdn.example/image.jpg'
          }
        },
        {
          type: 'text',
          text: 'Describe these images.'
        }
      ]
    })
  })

  it('maps thinking level to Claude adaptive thinking fields', () => {
    const adapter = new ClaudeAdapter()
    const requestBody = adapter.buildRequest(createTestUnifiedRequest({
      adapterPluginId: 'claude-compatible-adapter',
      baseUrl: 'https://api.anthropic.com/v1',
      model: 'claude-sonnet-4-5',
      options: {
        thinking: {
          enabled: true,
          effort: 'xhigh'
        }
      }
    }))

    expect(requestBody.thinking).toEqual({ type: 'adaptive' })
    expect(requestBody.output_config).toEqual({ effort: 'xhigh' })
  })

  it('requires tool_call_reason in Claude tool schemas', () => {
    const adapter = new ClaudeAdapter()
    const requestBody = adapter.buildRequest(createTestUnifiedRequest({
      adapterPluginId: 'claude-compatible-adapter',
      baseUrl: 'https://api.anthropic.com/v1',
      model: 'claude-sonnet-4-5',
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

    const inputSchema = requestBody.tools[0].input_schema
    expect(inputSchema.properties[TOOL_CALL_REASON_PARAMETER_NAME]).toEqual(expect.objectContaining({
      type: 'string',
      description: expect.stringContaining('same language the user is currently using')
    }))
    expect(inputSchema.required).toEqual(['query', TOOL_CALL_REASON_PARAMETER_NAME])
  })

  it('maps assistant tool_use -> tool_result -> final answer chain in Claude Messages format', () => {
    const adapter = new ClaudeAdapter()
    const requestBody = adapter.buildRequest(createTestUnifiedRequest({
      adapterPluginId: 'claude-compatible-adapter',
      baseUrl: 'https://api.anthropic.com/v1',
      model: 'claude-haiku',
      stream: true,
      messages: [
        {
          role: 'assistant',
          content: '',
          toolCalls: [{
            id: 'tool_1',
            type: 'function',
            function: {
              name: 'memory_retrieval',
              arguments: '{"query":"moltbook"}'
            }
          }]
        },
        {
          role: 'tool',
          toolCallId: 'tool_1',
          toolName: 'memory_retrieval',
          content: '{"result":"ok"}'
        },
        {
          role: 'assistant',
          content: 'final answer'
        }
      ],
      options: {}
    }))

    expect(Array.isArray(requestBody.messages)).toBe(true)
    expect(requestBody.messages).toHaveLength(3)

    expect(requestBody.messages[0].role).toBe('assistant')
    expect(requestBody.messages[0].content[0]).toMatchObject({
      type: 'tool_use',
      id: 'tool_1',
      name: 'memory_retrieval',
      input: { query: 'moltbook' }
    })

    expect(requestBody.messages[1].role).toBe('user')
    expect(requestBody.messages[1].content[0]).toMatchObject({
      type: 'tool_result',
      tool_use_id: 'tool_1',
      content: '{"result":"ok"}'
    })
    // tool_result must be the first block in the user content
    expect(requestBody.messages[1].content[0].type).toBe('tool_result')

    expect(requestBody.messages[2]).toMatchObject({
      role: 'assistant',
      content: [{ type: 'text', text: 'final answer' }]
    })
  })

  it('keeps the complete semantic compaction JSON in a tool result block', () => {
    const adapter = new ClaudeAdapter()
    const representation = JSON.stringify({
      compacted: true,
      lossy: true,
      result: { summary: 'x'.repeat(5_000) }
    })

    const requestBody = adapter.buildRequest(createTestUnifiedRequest({
      adapterPluginId: 'claude-compatible-adapter',
      messages: [{
        role: 'tool',
        content: representation,
        toolCallId: 'call-compact',
        toolName: 'web_fetch'
      }]
    }))

    expect(requestBody.messages[0]).toEqual({
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: 'call-compact',
        content: representation
      }]
    })
  })
})

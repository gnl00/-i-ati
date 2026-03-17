import { describe, expect, it } from 'vitest'
import { ClaudeAdapter } from '../claude'

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
      usage: { input_tokens: 10, output_tokens: 1 }
    }))
    expect(stopReasonChunk?.delta?.finishReason).toBe('tool_calls')

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
  it('maps assistant tool_use -> tool_result -> final answer chain in Claude Messages format', () => {
    const adapter = new ClaudeAdapter()
    const requestBody = adapter.buildRequest({
      adapterPluginId: 'claude-compatible-adapter',
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'test-key',
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
          }],
          segments: []
        },
        {
          role: 'tool',
          toolCallId: 'tool_1',
          content: '{"result":"ok"}',
          segments: []
        },
        {
          role: 'assistant',
          content: 'final answer',
          segments: []
        }
      ],
      options: {}
    } as IUnifiedRequest)

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
})

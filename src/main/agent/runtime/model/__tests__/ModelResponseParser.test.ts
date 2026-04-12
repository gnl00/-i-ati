import { describe, expect, it } from 'vitest'
import {
  createInitialModelResponseParserState,
  DefaultModelResponseParser
} from '../ModelResponseParser'
import type { RuntimeClock } from '../../loop/RuntimeClock'

const runtimeClock: RuntimeClock = {
  now: () => 123
}

describe('DefaultModelResponseParser', () => {
  it('keeps both reasoning and content when a delta chunk carries both', () => {
    const parser = new DefaultModelResponseParser(runtimeClock)

    const result = parser.parse({
      chunk: {
        kind: 'delta',
        responseId: 'resp-1',
        model: 'test-model',
        reasoning: 'reasoning text',
        content: 'visible text'
      },
      state: createInitialModelResponseParserState(),
      toolCalls: []
    })

    expect(result.deltas).toEqual([
      {
        type: 'response_metadata',
        timestamp: 123,
        responseId: 'resp-1',
        model: 'test-model'
      },
      {
        type: 'reasoning_delta',
        timestamp: 123,
        reasoning: 'reasoning text'
      },
      {
        type: 'content_delta',
        timestamp: 123,
        content: 'visible text'
      }
    ])
  })

  it('emits response_metadata for final chunk metadata', () => {
    const parser = new DefaultModelResponseParser(runtimeClock)

    const result = parser.parse({
      chunk: {
        kind: 'final',
        responseId: 'resp-final',
        model: 'final-model',
        raw: { done: true }
      },
      state: createInitialModelResponseParserState(),
      toolCalls: []
    })

    expect(result.deltas).toEqual([
      {
        type: 'response_metadata',
        timestamp: 123,
        responseId: 'resp-final',
        model: 'final-model'
      }
    ])
  })

  it('treats snapshot tool-call arguments as full replacement instead of appending twice', () => {
    const parser = new DefaultModelResponseParser(runtimeClock)

    const result = parser.parse({
      chunk: {
        kind: 'delta',
        toolCalls: [{
          argumentsMode: 'snapshot',
          toolCall: {
            id: 'tool-1',
            index: 0,
            type: 'function',
            function: {
              name: 'memory_retrieval',
              arguments: '{"query":"Gn preferences greeting tone playful","chatId":0,"topK":5,"threshold":0.6}'
            }
          }
        }],
        finishReason: 'tool_calls'
      },
      state: createInitialModelResponseParserState(),
      toolCalls: []
    })

    expect(result.toolCallsSnapshot).toEqual([
      {
        id: 'tool-1',
        index: 0,
        type: 'function',
        function: {
          name: 'memory_retrieval',
          arguments: '{"query":"Gn preferences greeting tone playful","chatId":0,"topK":5,"threshold":0.6}'
        }
      }
    ])

    expect(result.deltas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'tool_call_ready',
          toolCall: expect.objectContaining({
            function: expect.objectContaining({
              arguments: '{"query":"Gn preferences greeting tone playful","chatId":0,"topK":5,"threshold":0.6}'
            })
          })
        })
      ])
    )
  })

  it('preserves think-tag state across chunks without depending on legacy parser state', () => {
    const parser = new DefaultModelResponseParser(runtimeClock)

    const first = parser.parse({
      chunk: {
        kind: 'delta',
        content: 'visible <thi'
      },
      state: createInitialModelResponseParserState(),
      toolCalls: []
    })

    expect(first.deltas).toEqual([
      {
        type: 'content_delta',
        timestamp: 123,
        content: 'visible '
      }
    ])
    expect(first.state).toEqual({
      isInThinkTag: false,
      pendingThinkTagPrefix: '<thi',
      toolCallAssemblies: []
    })

    const second = parser.parse({
      chunk: {
        kind: 'delta',
        content: 'nk>hidden</think> tail'
      },
      state: first.state,
      toolCalls: []
    })

    expect(second.deltas).toEqual([
      {
        type: 'reasoning_delta',
        timestamp: 123,
        reasoning: 'hidden'
      },
      {
        type: 'content_delta',
        timestamp: 123,
        content: ' tail'
      }
    ])
    expect(second.state).toEqual({
      isInThinkTag: false,
      pendingThinkTagPrefix: '',
      toolCallAssemblies: []
    })
  })

  it('accumulates delta tool-call arguments across chunks and emits ready on finish', () => {
    const parser = new DefaultModelResponseParser(runtimeClock)

    const first = parser.parse({
      chunk: {
        kind: 'delta',
        toolCalls: [{
          argumentsMode: 'delta',
          toolCall: {
            id: 'tool-1',
            index: 0,
            type: 'function',
            function: {
              name: 'memory_retrieval',
              arguments: '{"query":"hello'
            }
          }
        }]
      },
      state: createInitialModelResponseParserState(),
      toolCalls: []
    })

    expect(first.deltas).toEqual([
      {
        type: 'tool_call_started',
        timestamp: 123,
        toolCallId: 'tool-1',
        toolCallIndex: 0,
        toolName: 'memory_retrieval'
      }
    ])
    expect(first.toolCallsSnapshot).toEqual([
      {
        id: 'tool-1',
        index: 0,
        type: 'function',
        function: {
          name: 'memory_retrieval',
          arguments: '{"query":"hello'
        }
      }
    ])

    const second = parser.parse({
      chunk: {
        kind: 'delta',
        toolCalls: [{
          argumentsMode: 'delta',
          toolCall: {
            id: 'tool-1',
            index: 0,
            type: 'function',
            function: {
              name: '',
              arguments: ' world"}'
            }
          }
        }],
        finishReason: 'tool_calls'
      },
      state: first.state,
      toolCalls: first.toolCallsSnapshot
    })

    expect(second.toolCallsSnapshot).toEqual([
      {
        id: 'tool-1',
        index: 0,
        type: 'function',
        function: {
          name: 'memory_retrieval',
          arguments: '{"query":"hello world"}'
        }
      }
    ])
    expect(second.deltas).toEqual([
      {
        type: 'tool_call_ready',
        timestamp: 123,
        toolCall: {
          id: 'tool-1',
          index: 0,
          type: 'function',
          function: {
            name: 'memory_retrieval',
            arguments: '{"query":"hello world"}'
          }
        }
      },
      {
        type: 'finish_reason',
        timestamp: 123,
        finishReason: 'tool_calls'
      }
    ])
  })
})

import { describe, expect, it } from 'vitest'
import {
  createInitialModelResponseParserState,
  DefaultModelResponseParser
} from '../ModelResponseParser'
import type { RuntimeClock } from '../../../loop/RuntimeClock'

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
})

import { describe, expect, it } from 'vitest'
import { InitialTranscriptSeedBuilder } from '../InitialTranscriptSeedBuilder'

describe('InitialTranscriptSeedBuilder', () => {
  it('maps user, assistant, tool, and reasoning messages to transcript seed', () => {
    const toolCall: IToolCall = {
      id: 'call-1',
      index: 0,
      type: 'function',
      function: {
        name: 'read_file',
        arguments: '{"path":"README.md"}'
      }
    }
    const toolCalls = [toolCall]
    const builder = new InitialTranscriptSeedBuilder()

    const seed = builder.build([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'look' },
          { type: 'image_url', image_url: { url: 'file://image.png', detail: 'high' } }
        ],
        createdAt: 10,
        segments: []
      },
      {
        role: 'assistant',
        content: 'I will inspect it.',
        model: 'model-1',
        createdAt: 20,
        segments: [
          { type: 'reasoning', content: 'think ' },
          { type: 'text', content: 'visible' },
          { type: 'reasoning', content: 'again' }
        ],
        toolCalls
      },
      {
        role: 'tool',
        content: 'tool result',
        toolCallId: 'call-1',
        name: 'read_file',
        createdAt: 30,
        segments: []
      }
    ] as ChatMessage[])

    expect(seed).toEqual([
      {
        kind: 'user',
        timestamp: 10,
        content: [
          { type: 'text', text: 'look' },
          { type: 'image_url', image_url: { url: 'file://image.png', detail: 'high' } }
        ]
      },
      {
        kind: 'assistant',
        timestamp: 20,
        model: 'model-1',
        content: 'I will inspect it.',
        reasoning: 'think again',
        toolCalls: [toolCall]
      },
      {
        kind: 'tool',
        timestamp: 30,
        toolCallId: 'call-1',
        toolName: 'read_file',
        content: 'tool result'
      }
    ])
    expect(seed[1].kind === 'assistant' ? seed[1].toolCalls : undefined).not.toBe(toolCalls)
  })

  it('omits empty assistant reasoning', () => {
    const builder = new InitialTranscriptSeedBuilder()

    const seed = builder.build([{
      role: 'assistant',
      content: 'done',
      segments: []
    }] as ChatMessage[])

    expect(seed).toEqual([{
      kind: 'assistant',
      timestamp: undefined,
      model: undefined,
      content: 'done',
      reasoning: undefined,
      toolCalls: undefined
    }])
  })
})

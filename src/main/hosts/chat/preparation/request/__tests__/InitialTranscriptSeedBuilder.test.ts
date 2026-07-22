import { describe, expect, it } from 'vitest'
import {
  InitialTranscriptSeedBuilder,
  SEMANTIC_COMPACTION_REQUEST_MAX_CHARACTERS
} from '../InitialTranscriptSeedBuilder'
import { serializeSemanticCompactionToolResult } from '../ToolResultRepresentationSerializer'
import { MESSAGE_SOURCE } from '@shared/messages/messageSources'
import type {
  ReadyToolResultCompaction
} from '@main/orchestration/chat/toolResultCompaction/ToolResultCompactionOverlay'

function parseToolResultRepresentation(content: unknown): Record<string, unknown> {
  expect(typeof content).toBe('string')
  return JSON.parse(content as string) as Record<string, unknown>
}

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

  it('wraps a ready JSON compaction for a persisted tool result', () => {
    const builder = new InitialTranscriptSeedBuilder()
    const message = {
      role: 'tool',
      content: JSON.stringify({ content: 'raw result '.repeat(100) }),
      toolCallId: 'call-compact',
      name: 'web_fetch',
      segments: []
    } as ChatMessage
    const compaction = {
      messageId: 42,
      toolName: 'web_fetch',
      toolCallId: 'call-compact',
      content: JSON.stringify({ summary: 'balanced result', citations: ['https://example.com'] }),
      originalHash: 'hash-42',
      level: 'balanced',
      compactorId: 'web-document',
      compactorVersion: 1,
      updatedAt: 10
    } as const

    const seed = builder.build([message], new Map([[message, compaction]]))

    expect(seed[0]).toMatchObject({ kind: 'tool' })
    expect(parseToolResultRepresentation(seed[0].content)).toEqual({
      compacted: true,
      lossy: true,
      result: {
        summary: 'balanced result',
        citations: ['https://example.com']
      }
    })
    expect(seed[0]).toMatchObject({
      contentRepresentation: 'semantic_compaction'
    })
  })

  it('preserves a non-JSON compaction as the compacted-result string', () => {
    const builder = new InitialTranscriptSeedBuilder()
    const message = {
      role: 'tool',
      content: 'raw result '.repeat(100),
      toolCallId: 'call-text-compact',
      name: 'web_fetch',
      segments: []
    } as ChatMessage
    const compaction = {
      messageId: 42,
      toolName: 'web_fetch',
      toolCallId: 'call-text-compact',
      content: 'balanced text result',
      originalHash: 'hash-42',
      level: 'balanced',
      compactorId: 'web-document',
      compactorVersion: 1,
      updatedAt: 10
    } as const

    const seed = builder.build([message], new Map([[message, compaction]]))

    expect(parseToolResultRepresentation(seed[0].content)).toEqual({
      compacted: true,
      lossy: true,
      result: 'balanced text result'
    })
  })

  it('keeps raw tool content when no ready compaction matches', () => {
    const builder = new InitialTranscriptSeedBuilder()
    const message = {
      role: 'tool',
      content: 'raw result',
      toolCallId: 'call-raw',
      name: 'web_fetch',
      segments: []
    } as ChatMessage
    const otherMessage = {
      ...message,
      toolCallId: 'other-call'
    } as ChatMessage
    const compaction = {
      messageId: 42,
      toolName: 'web_fetch',
      toolCallId: 'other-call',
      content: 'other result',
      originalHash: 'hash-42',
      level: 'balanced',
      compactorId: 'web-document',
      compactorVersion: 1,
      updatedAt: 10
    } as const

    const seed = builder.build([message], new Map([[otherMessage, compaction]]))

    expect(seed[0]).toMatchObject({
      kind: 'tool',
      content: 'raw result'
    })
  })

  it('uses persisted raw content when the representation envelope matches the raw length', () => {
    const builder = new InitialTranscriptSeedBuilder()
    const compactedContent = '{"summary":"short"}'
    const message = {
      role: 'tool',
      content: 'request-projected raw result',
      toolCallId: 'call-overhead',
      name: 'web_fetch',
      segments: []
    } as ChatMessage
    const persistedRawContent = 'r'.repeat(
      serializeSemanticCompactionToolResult(compactedContent).length
    )
    const compaction = {
      messageId: 42,
      toolName: 'web_fetch',
      toolCallId: 'call-overhead',
      content: compactedContent,
      originalHash: 'hash-42',
      level: 'balanced',
      compactorId: 'web-document',
      compactorVersion: 1,
      updatedAt: 10
    } as const

    const seed = builder.build(
      [message],
      new Map([[message, compaction]]),
      new Map([[message, persistedRawContent]])
    )

    expect(seed[0]).toMatchObject({
      kind: 'tool',
      content: persistedRawContent
    })
    expect(seed[0]).not.toHaveProperty('contentRepresentation')
  })

  it('uses persisted raw content when the representation is larger than raw', () => {
    const builder = new InitialTranscriptSeedBuilder()
    const message = {
      role: 'tool',
      content: 'short raw result',
      toolCallId: 'call-negative-gain',
      name: 'web_fetch',
      segments: []
    } as ChatMessage

    const seed = builder.build([message], new Map([[message, {
      messageId: 42,
      toolName: 'web_fetch',
      toolCallId: 'call-negative-gain',
      content: 'larger compact result',
      originalHash: 'hash-42',
      level: 'balanced',
      compactorId: 'web-document',
      compactorVersion: 1,
      updatedAt: 10
    }]]))

    expect(seed[0]).toMatchObject({ kind: 'tool', content: message.content })
    expect(seed[0]).not.toHaveProperty('contentRepresentation')
  })

  it('uses persisted raw content when the representation exceeds the semantic limit', () => {
    const builder = new InitialTranscriptSeedBuilder()
    const compactedContent = JSON.stringify({ summary: 'c'.repeat(SEMANTIC_COMPACTION_REQUEST_MAX_CHARACTERS) })
    const message = {
      role: 'tool',
      content: 'r'.repeat(40_000),
      toolCallId: 'call-over-limit',
      name: 'web_fetch',
      segments: []
    } as ChatMessage

    const seed = builder.build([message], new Map([[message, {
      messageId: 42,
      toolName: 'web_fetch',
      toolCallId: 'call-over-limit',
      content: compactedContent,
      originalHash: 'hash-42',
      level: 'balanced',
      compactorId: 'web-document',
      compactorVersion: 1,
      updatedAt: 10
    }]]))

    expect(seed[0]).toMatchObject({ kind: 'tool', content: message.content })
    expect(seed[0]).not.toHaveProperty('contentRepresentation')
  })

  it('uses persisted raw content when the representation contains inline image data', () => {
    const builder = new InitialTranscriptSeedBuilder()
    const message = {
      role: 'tool',
      content: 'r'.repeat(10_000),
      toolCallId: 'call-inline-image',
      name: 'web_fetch',
      segments: []
    } as ChatMessage

    const seed = builder.build([message], new Map([[message, {
      messageId: 42,
      toolName: 'web_fetch',
      toolCallId: 'call-inline-image',
      content: JSON.stringify({ image: `data:image/png;base64,${'a'.repeat(200)}` }),
      originalHash: 'hash-42',
      level: 'balanced',
      compactorId: 'web-document',
      compactorVersion: 1,
      updatedAt: 10
    }]]))

    expect(seed[0]).toMatchObject({ kind: 'tool', content: message.content })
    expect(seed[0]).not.toHaveProperty('contentRepresentation')
  })

  it('keeps repeated tool-call IDs associated with their source messages', () => {
    const builder = new InitialTranscriptSeedBuilder()
    const firstMessage = {
      role: 'tool',
      content: 'first raw result '.repeat(100),
      toolCallId: 'repeated-call',
      name: 'web_fetch',
      segments: []
    } as ChatMessage
    const secondMessage = {
      ...firstMessage,
      content: 'second raw result '.repeat(100)
    } as ChatMessage
    const firstCompaction = {
      messageId: 41,
      toolName: 'web_fetch',
      toolCallId: 'repeated-call',
      content: 'first compact result',
      originalHash: 'hash-41',
      level: 'balanced',
      compactorId: 'web-document',
      compactorVersion: 1,
      updatedAt: 10
    } as const
    const secondCompaction = {
      messageId: 42,
      toolName: 'web_fetch',
      toolCallId: 'repeated-call',
      content: 'second compact result',
      originalHash: 'hash-42',
      level: 'balanced',
      compactorId: 'web-document',
      compactorVersion: 1,
      updatedAt: 20
    } as const

    const seed = builder.build(
      [firstMessage, secondMessage],
      new Map<ChatMessage, ReadyToolResultCompaction>([
        [firstMessage, firstCompaction],
        [secondMessage, secondCompaction]
      ])
    )

    const compactedResults = seed.map(message => (
      parseToolResultRepresentation(message.content).result
    ))

    expect(compactedResults).toEqual(['first compact result', 'second compact result'])
  })

  it('keeps hidden vision observation source in user transcript seed', () => {
    const builder = new InitialTranscriptSeedBuilder()

    const seed = builder.build([{
      role: 'user',
      source: MESSAGE_SOURCE.VISION_OBSERVATION,
      content: '<vision_observation image_ref="message:101" status="ok">Summary</vision_observation>',
      createdAt: 40,
      segments: []
    }] as ChatMessage[])

    expect(seed).toEqual([{
      kind: 'user',
      timestamp: 40,
      source: MESSAGE_SOURCE.VISION_OBSERVATION,
      content: '<vision_observation image_ref="message:101" status="ok">Summary</vision_observation>'
    }])
  })
})

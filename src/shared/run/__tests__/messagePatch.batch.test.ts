import { describe, expect, it } from 'vitest'
import type { MessageSegmentPatch } from '../../chat/render-events'
import {
  applyMessageSegmentPatchToEntity,
  applyMessageSegmentPatchesToEntity
} from '../messagePatch'

function createAssistantMessage(segments: MessageSegment[]): MessageEntity {
  return {
    id: 1,
    chatId: 1,
    chatUuid: 'chat-1',
    body: {
      role: 'assistant',
      content: '',
      segments,
      typewriterCompleted: false
    }
  }
}

const textSegment = (
  segmentId: string,
  content: string,
  timestamp: number
): TextSegment => ({
  type: 'text',
  segmentId,
  content,
  timestamp
})

const reasoningSegment = (
  segmentId: string,
  content: string,
  timestamp: number,
  endedAt?: number
): ReasoningSegment => ({
  type: 'reasoning',
  segmentId,
  content,
  timestamp,
  ...(endedAt === undefined ? {} : { endedAt })
})

const toolCallSegment = (
  segmentId: string,
  toolCallId: string,
  status: string,
  timestamp: number
): ToolCallSegment => ({
  type: 'toolCall',
  segmentId,
  name: 'read',
  content: {
    toolName: 'read',
    status
  },
  timestamp,
  toolCallId,
  isError: false
})

const errorSegment = (
  segmentId: string,
  message: string,
  timestamp: number
): ErrorSegment => ({
  type: 'error',
  segmentId,
  error: {
    name: 'Error',
    message,
    timestamp
  }
})

function applySequentially(
  message: MessageEntity,
  patches: MessageSegmentPatch[]
): MessageEntity {
  return patches.reduce(
    (current, patch) => applyMessageSegmentPatchToEntity(current, patch),
    message
  )
}

describe('applyMessageSegmentPatchesToEntity', () => {
  it('matches sequential application for append-only patches', () => {
    const message = createAssistantMessage([
      textSegment('text-1', 'hello', 1)
    ])
    const patches: MessageSegmentPatch[] = [
      {
        segment: reasoningSegment('reasoning-1', 'thinking', 2)
      },
      {
        segment: toolCallSegment('tool-1', 'call-1', 'running', 3)
      },
      {
        segment: textSegment('text-2', 'world', 4)
      }
    ]

    const expected = applySequentially(message, patches)
    const actual = applyMessageSegmentPatchesToEntity(message, patches)

    expect(actual).toEqual(expected)
  })

  it('matches sequential application for repeated identity updates', () => {
    const existingReasoning = reasoningSegment('reasoning-1', 'thinking', 2)
    const message = createAssistantMessage([
      textSegment('text-1', 'hello', 1),
      existingReasoning
    ])
    const patches: MessageSegmentPatch[] = [
      {
        segment: reasoningSegment('reasoning-1', 'thinking more', 2)
      },
      {
        segment: reasoningSegment('reasoning-1', 'thinking much more', 2, 5)
      }
    ]

    const expected = applySequentially(message, patches)
    const actual = applyMessageSegmentPatchesToEntity(message, patches)

    expect(actual).toEqual(expected)
    expect(actual.body.segments?.[0]).toBe(message.body.segments[0])
  })

  it('matches sequential application for mixed segment updates and metadata', () => {
    const existingToolCalls: IToolCall[] = [{
      id: 'call-1',
      index: 0,
      type: 'function',
      function: {
        name: 'read',
        arguments: '{}'
      }
    }]
    const message = createAssistantMessage([
      textSegment('text-1', 'hello', 1),
      reasoningSegment('reasoning-1', 'thinking', 2),
      toolCallSegment('tool-1', 'call-1', 'running', 3),
      errorSegment('error-1', 'old failure', 4)
    ])
    message.body.toolCalls = existingToolCalls
    const toolCalls: IToolCall[] = [{
      id: 'call-1',
      index: 0,
      type: 'function',
      function: {
        name: 'read',
        arguments: '{}'
      }
    }]
    const patches: MessageSegmentPatch[] = [
      {
        segment: textSegment('text-1', 'hello world', 1),
        content: 'hello world'
      },
      {
        segment: reasoningSegment('reasoning-1', 'thinking deeply', 2, 6)
      },
      {
        segment: toolCallSegment('tool-1', 'call-1', 'completed', 3),
        toolCalls
      },
      {
        segment: errorSegment('error-1', 'new failure', 4),
        typewriterCompleted: true
      },
      {
        segment: textSegment('text-2', 'answer', 7)
      }
    ]

    const expected = applySequentially(message, patches)
    const actual = applyMessageSegmentPatchesToEntity(message, patches)

    expect(actual).toEqual(expected)
    expect(actual.body.toolCalls).toBe(existingToolCalls)
    expect(actual.body.typewriterCompleted).toBe(true)
  })

  it('matches replaceSegments followed by updates and appends', () => {
    const existingText = textSegment('text-1', 'hello', 1)
    const message = createAssistantMessage([existingText])
    const patches: MessageSegmentPatch[] = [
      {
        segment: reasoningSegment('reasoning-1', 'thinking', 2),
        replaceSegments: [
          textSegment('text-1', 'hello', 1),
          reasoningSegment('reasoning-1', 'thinking', 2)
        ],
        content: 'hello',
        typewriterCompleted: false
      },
      {
        segment: reasoningSegment('reasoning-1', 'thinking done', 2, 3)
      },
      {
        segment: textSegment('text-2', 'answer', 4)
      },
      {
        segment: textSegment('text-2', 'final answer', 4),
        content: 'hello final answer',
        typewriterCompleted: true
      }
    ]

    const expected = applySequentially(message, patches)
    const actual = applyMessageSegmentPatchesToEntity(message, patches)

    expect(actual).toEqual(expected)
    expect(actual.body.segments?.[0]).toBe(existingText)
  })

  it('returns the original entity for an empty batch', () => {
    const message = createAssistantMessage([])

    expect(applyMessageSegmentPatchesToEntity(message, [])).toBe(message)
  })
})

import { describe, expect, it } from 'vitest'
import {
  applyMessageSegmentPatchToEntity,
  mergeMessageEntityPreservingSegments
} from '../chatMessagePatch'

const textSegment = (args: {
  id: string
  content: string
  timestamp: number
}): TextSegment => ({
  type: 'text',
  segmentId: args.id,
  content: args.content,
  timestamp: args.timestamp
})

const reasoningSegment = (args: {
  id: string
  content: string
  timestamp: number
  endedAt?: number
}): ReasoningSegment => ({
  type: 'reasoning',
  segmentId: args.id,
  content: args.content,
  timestamp: args.timestamp,
  ...(args.endedAt !== undefined ? { endedAt: args.endedAt } : {})
})

const createAssistantMessage = (segments: MessageSegment[]): MessageEntity => ({
  id: 1,
  chatId: 1,
  chatUuid: 'chat-1',
  body: {
    role: 'assistant',
    content: '',
    segments,
    typewriterCompleted: false
  }
})

describe('chatMessagePatch', () => {
  it('preserves stable segment references when merging full message snapshots', () => {
    const existingText = textSegment({
      id: 'seg:text:1',
      content: 'hello',
      timestamp: 1
    })
    const existingReasoning = reasoningSegment({
      id: 'seg:reasoning:1',
      content: 'thinking',
      timestamp: 2,
      endedAt: 3
    })

    const previous = createAssistantMessage([existingText, existingReasoning])
    const next = createAssistantMessage([
      textSegment({
        id: 'seg:text:1',
        content: 'hello',
        timestamp: 1
      }),
      reasoningSegment({
        id: 'seg:reasoning:1',
        content: 'thinking',
        timestamp: 2,
        endedAt: 3
      })
    ])

    const merged = mergeMessageEntityPreservingSegments(previous, next)

    expect(merged.body.segments?.[0]).toBe(existingText)
    expect(merged.body.segments?.[1]).toBe(existingReasoning)
  })

  it('preserves unchanged segment references when replaceSegments carries a full snapshot', () => {
    const existingText = textSegment({
      id: 'seg:text:1',
      content: 'hello',
      timestamp: 1
    })
    const existingReasoning = reasoningSegment({
      id: 'seg:reasoning:1',
      content: 'thinking',
      timestamp: 2,
      endedAt: 3
    })

    const message = createAssistantMessage([existingText, existingReasoning])

    const patched = applyMessageSegmentPatchToEntity(message, {
      segment: existingText,
      replaceSegments: [
        textSegment({
          id: 'seg:text:1',
          content: 'hello',
          timestamp: 1
        }),
        reasoningSegment({
          id: 'seg:reasoning:1',
          content: 'thinking',
          timestamp: 2,
          endedAt: 3
        })
      ],
      content: 'hello',
      typewriterCompleted: true
    })

    expect(patched.body.segments?.[0]).toBe(existingText)
    expect(patched.body.segments?.[1]).toBe(existingReasoning)
    expect(patched.body.content).toBe('hello')
    expect(patched.body.typewriterCompleted).toBe(true)
  })

  it('replaces only the targeted segment when applying an incremental patch', () => {
    const existingText = textSegment({
      id: 'seg:text:1',
      content: 'hello',
      timestamp: 1
    })
    const existingReasoning = reasoningSegment({
      id: 'seg:reasoning:1',
      content: 'thinking',
      timestamp: 2
    })

    const message = createAssistantMessage([existingText, existingReasoning])

    const patched = applyMessageSegmentPatchToEntity(message, {
      segment: reasoningSegment({
        id: 'seg:reasoning:1',
        content: 'thinking harder',
        timestamp: 2,
        endedAt: 4
      }),
      toolCalls: [{
        id: 'tool-1',
        index: 0,
        type: 'function',
        function: {
          name: 'read',
          arguments: '{}'
        }
      }]
    })

    expect(patched.body.segments?.[0]).toBe(existingText)
    expect(patched.body.segments?.[1]).not.toBe(existingReasoning)
    expect((patched.body.segments?.[1] as ReasoningSegment).content).toBe('thinking harder')
    expect(patched.body.toolCalls).toHaveLength(1)
  })
})

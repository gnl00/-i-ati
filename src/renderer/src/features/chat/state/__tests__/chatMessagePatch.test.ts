import { describe, expect, it } from 'vitest'
import {
  applyMessageSegmentPatchToEntity,
  areToolCallsEquivalent,
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

const toolCallSegment = (args: {
  id: string
  toolCallId: string
  name: string
  timestamp: number
  status: string
  result?: unknown
  cost?: number
}): ToolCallSegment => ({
  type: 'toolCall',
  segmentId: args.id,
  name: args.name,
  content: {
    toolName: args.name,
    status: args.status,
    ...(args.result !== undefined ? { result: args.result } : {})
  },
  ...(args.cost !== undefined ? { cost: args.cost } : {}),
  isError: false,
  timestamp: args.timestamp,
  toolCallId: args.toolCallId
})

const toolCalls = (args: {
  id: string
  index?: number
  name: string
  argumentsText: string
}): IToolCall[] => [{
  id: args.id,
  index: args.index,
  type: 'function',
  function: {
    name: args.name,
    arguments: args.argumentsText
  }
}]

describe('chatMessagePatch', () => {
  it('treats structurally equal tool calls as equivalent', () => {
    const previous = toolCalls({
      id: 'tool-1',
      index: 0,
      name: 'read',
      argumentsText: '{}'
    })
    const next = toolCalls({
      id: 'tool-1',
      index: 0,
      name: 'read',
      argumentsText: '{}'
    })

    expect(areToolCallsEquivalent(previous, next)).toBe(true)
  })

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

  it('preserves text segment and toolCalls references when patching only a tool segment', () => {
    const existingText = textSegment({
      id: 'seg:text:1',
      content: 'hello',
      timestamp: 1
    })
    const existingTool = toolCallSegment({
      id: 'seg:tool:1',
      toolCallId: 'tool-1',
      name: 'read',
      timestamp: 2,
      status: 'pending'
    })
    const existingToolCalls = toolCalls({
      id: 'tool-1',
      index: 0,
      name: 'read',
      argumentsText: '{}'
    })

    const message: MessageEntity = {
      ...createAssistantMessage([existingText, existingTool]),
      body: {
        ...createAssistantMessage([existingText, existingTool]).body,
        content: 'hello',
        toolCalls: existingToolCalls
      }
    }

    const patched = applyMessageSegmentPatchToEntity(message, {
      segment: toolCallSegment({
        id: 'seg:tool:1',
        toolCallId: 'tool-1',
        name: 'read',
        timestamp: 2,
        status: 'success',
        result: 'file content',
        cost: 1200
      }),
      content: 'hello',
      toolCalls: toolCalls({
        id: 'tool-1',
        index: 0,
        name: 'read',
        argumentsText: '{}'
      })
    })

    expect(patched.body.segments?.[0]).toBe(existingText)
    expect(patched.body.segments?.[1]).not.toBe(existingTool)
    expect(patched.body.toolCalls).toBe(existingToolCalls)
  })

  it('preserves toolCalls reference when merging a full snapshot with equivalent toolCalls', () => {
    const existingToolCalls = toolCalls({
      id: 'tool-1',
      index: 0,
      name: 'read',
      argumentsText: '{}'
    })

    const previous: MessageEntity = {
      ...createAssistantMessage([
        textSegment({
          id: 'seg:text:1',
          content: 'hello',
          timestamp: 1
        })
      ]),
      body: {
        ...createAssistantMessage([]).body,
        content: 'hello',
        segments: [
          textSegment({
            id: 'seg:text:1',
            content: 'hello',
            timestamp: 1
          })
        ],
        toolCalls: existingToolCalls
      }
    }

    const next: MessageEntity = {
      ...createAssistantMessage([
        textSegment({
          id: 'seg:text:1',
          content: 'hello',
          timestamp: 1
        })
      ]),
      body: {
        ...createAssistantMessage([]).body,
        content: 'hello',
        segments: [
          textSegment({
            id: 'seg:text:1',
            content: 'hello',
            timestamp: 1
          })
        ],
        toolCalls: toolCalls({
          id: 'tool-1',
          index: 0,
          name: 'read',
          argumentsText: '{}'
        })
      }
    }

    const merged = mergeMessageEntityPreservingSegments(previous, next)

    expect(merged.body.toolCalls).toBe(existingToolCalls)
  })
})

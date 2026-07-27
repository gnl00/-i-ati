import { describe, expect, it } from 'vitest'
import {
  buildChatStatsModel,
  formatProgressPercent,
  type ChatStatsModel
} from '../chatStatsModel'

function message(
  id: number,
  tokens: number,
  role: MessageEntity['body']['role'] = 'assistant',
  segments: MessageSegment[] = []
): MessageEntity {
  return {
    id,
    tokens,
    body: {
      role,
      content: '',
      segments
    }
  }
}

function build(
  messages: MessageEntity[],
  overrides: Partial<Parameters<typeof buildChatStatsModel>[0]> = {}
): ChatStatsModel {
  return buildChatStatsModel({
    messages,
    activeCompressedMessageIds: new Set(),
    contextWindowTokens: 1000,
    triggerTokenRatio: 0.7,
    autoCompactEnabled: true,
    compressionPending: false,
    ...overrides
  })
}

describe('buildChatStatsModel', () => {
  it('uses accumulated tokens divided by the trigger threshold for progress', () => {
    const stats = build([message(1, 699)])

    expect(stats.thresholdTokens).toBe(700)
    expect(stats.progressToCompact).toBeCloseTo(699 / 700)
    expect(formatProgressPercent(stats.progressToCompact)).toBe('99.9%')
    expect(stats.status).toBe('enabled')
  })

  it('caps the progress rail at the trigger threshold', () => {
    const stats = build([message(1, 700)])

    expect(stats.progressToCompact).toBe(1)
    expect(formatProgressPercent(stats.progressToCompact)).toBe('100%')
  })

  it('excludes active summary messages from the current accumulation', () => {
    const stats = build(
      [message(1, 400), message(2, 299)],
      { activeCompressedMessageIds: new Set([1]) }
    )

    expect(stats.accumulatedTokens).toBe(299)
    expect(stats.totalConversationTokens).toBe(699)
  })

  it('keeps historical totals separate and ignores invalid token values', () => {
    const stats = build([
      message(1, 400),
      message(2, 200),
      message(3, Number.NaN),
      message(4, -20),
      { ...message(5, 100), id: undefined }
    ], {
      activeCompressedMessageIds: new Set([1])
    })

    expect(stats.totalConversationTokens).toBe(700)
    expect(stats.accumulatedTokens).toBe(200)
  })

  it('reports context availability and runtime auto-compact states', () => {
    expect(build([message(1, 10)], {
      contextWindowTokens: undefined
    }).status).toBe('context-unavailable')

    expect(build([message(1, 10)], {
      autoCompactEnabled: false
    }).status).toBe('disabled')

    expect(build([message(1, 700)], {
      compressionPending: true
    }).status).toBe('compacting')
  })

  it('counts tool calls and results independently', () => {
    const toolCall = {
      type: 'toolCall',
      segmentId: 'tool-1',
      name: 'search',
      content: {
        toolName: 'search',
        args: {},
        status: 'completed'
      }
    } as ToolCallSegment
    const stats = build([
      message(1, 10, 'assistant', [toolCall]),
      message(2, 5, 'tool')
    ])

    expect(stats.toolCallCount).toBe(1)
    expect(stats.toolResultCount).toBe(1)
  })
})

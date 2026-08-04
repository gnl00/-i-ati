import { describe, expect, it } from 'vitest'
import { findSelectedToolCall } from '../toolcall/ToolCallInspectorContent'

const messageWith = (
  chatUuid: string,
  segments: MessageSegment[]
): MessageEntity => ({
  chatUuid,
  body: {
    role: 'assistant',
    content: '',
    segments
  }
})

const toolCall = (
  segmentId: string,
  toolCallId: string,
  status: string
): ToolCallSegment => ({
  type: 'toolCall',
  segmentId,
  toolCallId,
  name: 'exec',
  timestamp: 1,
  content: {
    toolName: 'exec',
    args: { command: 'pnpm test' },
    status
  }
})

describe('findSelectedToolCall', () => {
  it('prefers the latest preview segment with the exact segment id', () => {
    const committed = toolCall('segment-1', 'tool-reused', 'running')
    const preview = toolCall('segment-1', 'tool-reused', 'completed')

    expect(findSelectedToolCall(
      [messageWith('chat-1', [committed])],
      messageWith('chat-1', [preview]),
      'chat-1',
      'segment-1'
    )).toBe(preview)
  })

  it('does not reuse a toolCallId when the selected segment is unavailable', () => {
    const otherChat = toolCall('other-segment', 'tool-reused', 'completed')
    const currentChat = toolCall('current-segment', 'tool-reused', 'running')

    expect(findSelectedToolCall(
      [
        messageWith('chat-2', [otherChat]),
        messageWith('chat-1', [currentChat])
      ],
      null,
      'chat-1',
      'missing-segment'
    )).toBeUndefined()
  })
})

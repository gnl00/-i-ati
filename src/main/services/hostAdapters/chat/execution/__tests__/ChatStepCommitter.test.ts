import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatStepCommitter } from '../ChatStepCommitter'

const textSegment = (content: string, timestamp: number): TextSegment => ({
  type: 'text',
  segmentId: `test:text:${timestamp}:${content}`,
  content,
  timestamp
})

const reasoningSegment = (content: string, timestamp: number): ReasoningSegment => ({
  type: 'reasoning',
  segmentId: `test:reasoning:${timestamp}:${content}`,
  content,
  timestamp
})

const toolCallSegment = (
  toolCallId: string,
  name: string,
  timestamp: number,
  content: ToolCallSegment['content'],
  toolCallIndex?: number
): ToolCallSegment => ({
  type: 'toolCall',
  segmentId: `test:toolCall:${toolCallId}`,
  name,
  timestamp,
  toolCallId,
  ...(toolCallIndex !== undefined ? { toolCallIndex } : {}),
  content
})

const noopMessageEvents = {
  emitMessageUpdated: vi.fn(),
  emitStreamPreviewUpdated: vi.fn(),
  emitStreamPreviewCleared: vi.fn(),
  emitToolResultAttached: vi.fn()
}

const noopConversationStore = {
  persistToolResultMessage: vi.fn()
}

describe('ChatStepCommitter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps final-cycle text visible when there are no tool calls', () => {
    const messageEntities: MessageEntity[] = [{
      id: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'assistant',
        content: '',
        segments: [],
        typewriterCompleted: false
      }
    }]

    const committer = new ChatStepCommitter(
      messageEntities,
      noopMessageEvents,
      noopConversationStore as any
    )

    committer.commitFinalCycle({
      content: 'Final answer',
      segments: [textSegment('Final answer', Date.now())]
    })

    expect(committer.getFinalAssistantMessage().body.content).toBe('Final answer')
    expect(committer.getFinalAssistantMessage().body.toolCalls).toBeUndefined()
  })

  it('hides intermediate tool-cycle text while preserving tool activity', () => {
    const messageEntities: MessageEntity[] = [{
      id: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'assistant',
        content: '',
        segments: [],
        typewriterCompleted: false
      }
    }]

    const committer = new ChatStepCommitter(
      messageEntities,
      noopMessageEvents,
      noopConversationStore as any
    )

    committer.commitToolOnlyCycle({
      content: 'Intermediate summary that should stay hidden',
      segments: [textSegment('Intermediate summary that should stay hidden', Date.now())],
      toolCalls: [{
        id: 'tool-1',
        type: 'function',
        function: {
          name: 'emotion_report',
          arguments: '{}'
        }
      }]
    })

    expect(committer.getFinalAssistantMessage().body.content).toBe('')
    expect(committer.getFinalAssistantMessage().body.segments).toEqual([])
    expect(committer.getFinalAssistantMessage().body.toolCalls).toHaveLength(1)
  })

  it('keeps tool-only committed projections free of transient text while preserving reasoning', () => {
    const messageEntities: MessageEntity[] = [{
      id: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'assistant',
        content: '',
        segments: [],
        typewriterCompleted: false
      }
    }]

    const committer = new ChatStepCommitter(
      messageEntities,
      noopMessageEvents,
      noopConversationStore as any
    )

    committer.commitToolOnlyCycle({
      content: 'hidden answer draft',
      segments: [
        reasoningSegment('thinking...', Date.now()),
        textSegment('hidden answer draft', Date.now())
      ]
    })

    expect(committer.getFinalAssistantMessage().body.content).toBe('')
    expect(committer.getFinalAssistantMessage().body.segments).toEqual([
      expect.objectContaining({
        type: 'reasoning',
        content: 'thinking...'
      })
    ])
  })

  it('commits final tool-cycle text when the runtime stops after a side-effect tool', () => {
    const messageEntities: MessageEntity[] = [{
      id: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'assistant',
        content: '',
        segments: [],
        typewriterCompleted: false
      }
    }]

    const committer = new ChatStepCommitter(
      messageEntities,
      noopMessageEvents,
      noopConversationStore as any
    )

    committer.commitFinalCycle({
      content: 'Final answer after emotion sync',
      segments: [textSegment('Final answer after emotion sync', Date.now())],
      toolCalls: [{
        id: 'tool-1',
        type: 'function',
        function: {
          name: 'emotion_report',
          arguments: '{}'
        }
      }]
    })

    expect(committer.getFinalAssistantMessage().body.content).toBe('Final answer after emotion sync')
    expect(committer.getFinalAssistantMessage().body.toolCalls).toHaveLength(1)
  })

  it('preserves prior tool-result segments when the next cycle commits final text', () => {
    const messageEntities: MessageEntity[] = [{
      id: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'assistant',
        content: '',
        segments: [],
        typewriterCompleted: false
      }
    }]

    const committer = new ChatStepCommitter(
      messageEntities,
      noopMessageEvents,
      noopConversationStore as any
    )

    committer.commitToolOnlyCycle({
      content: 'hidden tool draft',
      segments: [toolCallSegment('tool-1', 'web_search', Date.now(), {
        toolName: 'web_search',
        status: 'success',
        result: { ok: true }
      })]
    })

    committer.commitFinalCycle({
      content: 'Final answer after tool execution',
      segments: [textSegment('Final answer after tool execution', Date.now())]
    })

    expect(committer.getFinalAssistantMessage().body.content).toBe('Final answer after tool execution')
    expect(committer.getFinalAssistantMessage().body.segments).toEqual([
      expect.objectContaining({
        type: 'toolCall',
        toolCallId: 'tool-1'
      }),
      expect.objectContaining({
        type: 'text',
        content: 'Final answer after tool execution'
      })
    ])
  })

  it('preserves prior tool-result segments when a later tool-only cycle is committed', () => {
    const messageEntities: MessageEntity[] = [{
      id: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'assistant',
        content: '',
        segments: [],
        typewriterCompleted: false
      }
    }]

    const committer = new ChatStepCommitter(
      messageEntities,
      noopMessageEvents,
      noopConversationStore as any
    )

    committer.beginCycle()
    committer.commitToolOnlyCycle({
      content: 'first hidden tool draft',
      segments: [toolCallSegment('tool-1', 'memory_retrieval', 1, {
        toolName: 'memory_retrieval',
        status: 'success',
        result: { ok: true }
      })],
      toolCalls: [{
        id: 'tool-1',
        type: 'function',
        function: {
          name: 'memory_retrieval',
          arguments: '{}'
        }
      }]
    })

    committer.beginCycle()
    committer.commitToolOnlyCycle({
      content: 'second hidden tool draft',
      segments: [toolCallSegment('tool-2', 'emotion_report', 2, {
        toolName: 'emotion_report',
        status: 'success',
        result: { ok: true }
      })],
      toolCalls: [{
        id: 'tool-2',
        type: 'function',
        function: {
          name: 'emotion_report',
          arguments: '{}'
        }
      }]
    })

    expect(committer.getFinalAssistantMessage().body.segments).toEqual([
      expect.objectContaining({
        type: 'toolCall',
        toolCallId: 'tool-1'
      }),
      expect.objectContaining({
        type: 'toolCall',
        toolCallId: 'tool-2'
      })
    ])
    expect(committer.getFinalAssistantMessage().body.toolCalls).toEqual([
      expect.objectContaining({ id: 'tool-1' }),
      expect.objectContaining({ id: 'tool-2' })
    ])
  })

  it('does not collapse identical reasoning segments from different cycles even when timestamp matches', () => {
    const messageEntities: MessageEntity[] = [{
      id: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'assistant',
        content: '',
        segments: [],
        typewriterCompleted: false
      }
    }]

    const committer = new ChatStepCommitter(
      messageEntities,
      noopMessageEvents,
      noopConversationStore as any
    )

    committer.beginCycle()
    committer.commitToolOnlyCycle({
      content: 'hidden cycle one',
      segments: [reasoningSegment('same reasoning', 100)]
    })

    committer.beginCycle()
    committer.commitToolOnlyCycle({
      content: 'hidden cycle two',
      segments: [reasoningSegment('same reasoning', 100)]
    })

    expect(committer.getFinalAssistantMessage().body.segments).toEqual([
      expect.objectContaining({
        type: 'reasoning',
        content: 'same reasoning',
        timestamp: 100
      }),
      expect.objectContaining({
        type: 'reasoning',
        content: 'same reasoning',
        timestamp: 100
      })
    ])
  })

  it('emits transient stream preview updates without mutating the committed assistant message', () => {
    const messageEntities: MessageEntity[] = [{
      id: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'assistant',
        model: 'test-model',
        content: '',
        segments: [],
        typewriterCompleted: false
      }
    }]

    const committer = new ChatStepCommitter(
      messageEntities,
      noopMessageEvents,
      noopConversationStore as any
    )

    committer.updateStreamPreview({
      content: 'Preview answer',
      segments: [textSegment('Preview answer', Date.now())]
    })

    expect(noopMessageEvents.emitStreamPreviewUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        chatUuid: 'chat-1',
        body: expect.objectContaining({
          source: 'stream_preview',
          content: 'Preview answer',
          typewriterCompleted: false
        })
      })
    )
    expect(committer.getFinalAssistantMessage().body.content).toBe('')

    committer.clearStreamPreview()
    expect(noopMessageEvents.emitStreamPreviewCleared).toHaveBeenCalledTimes(1)
  })

})

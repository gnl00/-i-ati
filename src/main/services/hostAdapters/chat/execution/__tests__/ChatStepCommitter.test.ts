import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatStepCommitter } from '../ChatStepCommitter'

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
      segments: [{
        type: 'text',
        content: 'Final answer',
        timestamp: Date.now()
      }]
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
      segments: [{
        type: 'text',
        content: 'Intermediate summary that should stay hidden',
        timestamp: Date.now()
      }],
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
        {
          type: 'reasoning',
          content: 'thinking...',
          timestamp: Date.now()
        },
        {
          type: 'text',
          content: 'hidden answer draft',
          timestamp: Date.now()
        }
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
      segments: [{
        type: 'text',
        content: 'Final answer after emotion sync',
        timestamp: Date.now()
      }],
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
      segments: [{
        type: 'toolCall',
        name: 'web_search',
        timestamp: Date.now(),
        toolCallId: 'tool-1',
        content: {
          toolName: 'web_search',
          status: 'success',
          result: { ok: true }
        }
      }]
    })

    committer.commitFinalCycle({
      content: 'Final answer after tool execution',
      segments: [{
        type: 'text',
        content: 'Final answer after tool execution',
        timestamp: Date.now()
      }]
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
      segments: [{
        type: 'toolCall',
        name: 'memory_retrieval',
        timestamp: 1,
        toolCallId: 'tool-1',
        content: {
          toolName: 'memory_retrieval',
          status: 'success',
          result: { ok: true }
        }
      }],
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
      segments: [{
        type: 'toolCall',
        name: 'emotion_report',
        timestamp: 2,
        toolCallId: 'tool-2',
        content: {
          toolName: 'emotion_report',
          status: 'success',
          result: { ok: true }
        }
      }],
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
      segments: [{
        type: 'reasoning',
        content: 'same reasoning',
        timestamp: 100
      }]
    })

    committer.beginCycle()
    committer.commitToolOnlyCycle({
      content: 'hidden cycle two',
      segments: [{
        type: 'reasoning',
        content: 'same reasoning',
        timestamp: 100
      }]
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
      segments: [{
        type: 'text',
        content: 'Preview answer',
        timestamp: Date.now()
      }]
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

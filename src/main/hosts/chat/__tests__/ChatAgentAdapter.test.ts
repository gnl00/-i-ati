import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RUN_EVENTS } from '@shared/run/events'
import { CHAT_HOST_EVENTS } from '@shared/chat/host-events'

vi.mock('../preparation', () => ({
  ChatPreparationPipeline: class {}
}))

vi.mock('../finalize/ChatFinalizeService', () => ({
  ChatFinalizeService: class {}
}))

import { ChatAgentAdapter } from '../ChatAgentAdapter'

describe('ChatAgentAdapter', () => {
  const prepared = {
    runSpec: {
      submissionId: 'submission-1',
      modelContext: {
        model: { id: 'model-1' }
      }
    },
    chatContext: {
      chat: {
        id: 1,
        uuid: 'chat-1'
      },
      workspacePath: './workspaces/chat-1',
      historyMessages: [
        {
          id: 11,
          body: {
            role: 'assistant',
            content: 'history'
          }
        }
      ],
      createdMessages: [
        {
          id: 101,
          body: {
            role: 'user',
            content: 'hello'
          }
        },
        {
          id: 102,
          body: {
            role: 'assistant',
            content: ''
          }
        }
      ],
      messageEntities: [],
      assistantPlaceholder: {
        id: 102
      }
    }
  } as any

  let preparationPipeline: { prepare: ReturnType<typeof vi.fn> }
  let finalizeService: {
    finalizeAssistantMessage: ReturnType<typeof vi.fn>
    finalizeChatEntity: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    preparationPipeline = {
      prepare: vi.fn(async () => prepared)
    }
    finalizeService = {
      finalizeAssistantMessage: vi.fn(),
      finalizeChatEntity: vi.fn()
    }
  })

  it('emits chat preparation events during prepareRun', async () => {
    const adapter = new ChatAgentAdapter(preparationPipeline as any, finalizeService as any)
    const emitter = {
      emit: vi.fn()
    } as any

    const result = await adapter.prepareRun({ submissionId: 'submission-1' } as any, emitter)

    expect(result).toBe(prepared)
    expect(emitter.emit).toHaveBeenCalledWith(CHAT_HOST_EVENTS.CHAT_READY, {
      chatEntity: prepared.chatContext.chat,
      workspacePath: prepared.chatContext.workspacePath
    })
    expect(emitter.emit).toHaveBeenCalledWith(CHAT_HOST_EVENTS.MESSAGES_LOADED, {
      messages: prepared.chatContext.historyMessages
    })
    expect(emitter.emit).toHaveBeenCalledWith(RUN_EVENTS.MESSAGE_CREATED, {
      message: prepared.chatContext.createdMessages[0]
    })
    expect(emitter.emit).toHaveBeenCalledWith(RUN_EVENTS.MESSAGE_CREATED, {
      message: prepared.chatContext.createdMessages[1]
    })
  })

  it('maps chat context into a narrow step runtime context', () => {
    const adapter = new ChatAgentAdapter(preparationPipeline as any, finalizeService as any)

    const result = adapter.createStepRuntimeContext(prepared.chatContext)

    expect(result).toEqual({
      messageEntities: prepared.chatContext.messageEntities,
      chatId: prepared.chatContext.chat.id,
      chatUuid: prepared.chatContext.chat.uuid
    })
  })

  it('emits final assistant message update after finalizeRun', async () => {
    const adapter = new ChatAgentAdapter(preparationPipeline as any, finalizeService as any)
    const finalizedAssistantMessage = {
      id: 102,
      body: {
        role: 'assistant',
        content: 'hello',
        emotion: {
          label: 'happiness',
          emoji: '😊'
        },
        typewriterCompleted: true
      }
    }
    const finalizedChat = {
      ...prepared.chatContext.chat,
      title: 'hello'
    }

    finalizeService.finalizeAssistantMessage.mockResolvedValue(finalizedAssistantMessage)
    finalizeService.finalizeChatEntity.mockReturnValue(finalizedChat)

    const emitter = {
      emit: vi.fn()
    } as any

    const result = await adapter.finalizeRun({
      input: {
        submissionId: 'submission-1',
        input: { textCtx: 'hi' },
        modelRef: { modelId: 'model-1', accountId: 'account-1' }
      } as any,
      runSpec: prepared.runSpec as any,
      chatContext: prepared.chatContext as any,
      stepResult: {
        completed: true,
        finishReason: 'completed',
        requestHistoryMessages: [],
        artifacts: []
      },
      emitter,
      stepCommitter: {
        getFinalAssistantMessage: () => finalizedAssistantMessage as any,
        getLastUsage: () => undefined
      }
    })

    expect(emitter.emit).toHaveBeenCalledWith(RUN_EVENTS.MESSAGE_UPDATED, {
      message: finalizedAssistantMessage
    })
    expect(emitter.emit).toHaveBeenCalledWith(CHAT_HOST_EVENTS.CHAT_UPDATED, {
      chatEntity: finalizedChat
    })
    expect(result.runResult.assistantMessageId).toBe(102)
  })
})

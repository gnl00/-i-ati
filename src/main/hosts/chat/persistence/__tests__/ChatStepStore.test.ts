import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  saveMessageMock,
  getMessageByIdMock,
  updateChatMock,
  getChatByIdMock,
  getChatByUuidMock,
  getEmotionStateByChatIdMock,
  upsertEmotionStateMock
} = vi.hoisted(() => ({
  saveMessageMock: vi.fn(),
  getMessageByIdMock: vi.fn(),
  updateChatMock: vi.fn(),
  getChatByIdMock: vi.fn(),
  getChatByUuidMock: vi.fn(),
  getEmotionStateByChatIdMock: vi.fn(),
  upsertEmotionStateMock: vi.fn()
}))

vi.mock('@main/db/DatabaseService', () => ({
  default: {
    saveMessage: saveMessageMock,
    getMessageById: getMessageByIdMock,
    updateChat: updateChatMock,
    getChatById: getChatByIdMock,
    getChatByUuid: getChatByUuidMock,
    getEmotionStateByChatId: getEmotionStateByChatIdMock,
    upsertEmotionState: upsertEmotionStateMock
  }
}))

vi.mock('@main/services/emotion/EmotionInferenceService', () => ({
  default: {
    infer: vi.fn(async () => null)
  }
}))

import { ChatStepStore } from '../ChatStepStore'
import { MESSAGE_SOURCE } from '@shared/messages/messageSources'

describe('ChatStepStore.finalizeAssistantMessage', () => {
  beforeEach(() => {
    saveMessageMock.mockReset()
    saveMessageMock.mockReturnValue(102)
    getMessageByIdMock.mockReset()
    getMessageByIdMock.mockReturnValue(undefined)
    updateChatMock.mockReset()
    getChatByIdMock.mockReset()
    getChatByIdMock.mockReturnValue(undefined)
    getChatByUuidMock.mockReset()
    getChatByUuidMock.mockReturnValue(undefined)
    getEmotionStateByChatIdMock.mockReset()
    upsertEmotionStateMock.mockReset()
  })

  it('persists media content for vision-capable llm models', () => {
    const store = new ChatStepStore()
    const chatEntity = {
      id: 1,
      uuid: 'chat-1',
      title: 'Chat',
      messages: [],
      createTime: 1,
      updateTime: 1
    } as unknown as ChatEntity

    store.createUserMessage(
      chatEntity,
      {
        id: 'gpt-vision',
        label: 'GPT Vision',
        type: 'llm',
        modalities: ['text', 'image']
      },
      {
        textCtx: 'describe this',
        mediaCtx: ['data:image/png;base64,abc']
      }
    )

    expect(saveMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: 'data:image/png;base64,abc',
              detail: 'auto'
            }
          },
          {
            type: 'text',
            text: 'describe this'
          }
        ]
      })
    }))
  })

  it('persists media content for text models when mediaCtx has images', () => {
    const store = new ChatStepStore()
    const chatEntity = {
      id: 1,
      uuid: 'chat-1',
      title: 'Chat',
      messages: [],
      createTime: 1,
      updateTime: 1
    } as unknown as ChatEntity

    store.createUserMessage(
      chatEntity,
      {
        id: 'text-model',
        label: 'Text Model',
        type: 'llm'
      },
      {
        textCtx: 'describe this',
        mediaCtx: ['data:image/png;base64,abc']
      }
    )

    expect(saveMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: 'data:image/png;base64,abc',
              detail: 'auto'
            }
          },
          {
            type: 'text',
            text: 'describe this'
          }
        ]
      })
    }))
  })

  it('persists hidden vision observation messages', () => {
    const store = new ChatStepStore()
    const chatEntity = {
      id: 1,
      uuid: 'chat-1',
      title: 'Chat',
      messages: [],
      createTime: 1,
      updateTime: 1
    } as unknown as ChatEntity

    const entity = store.persistVisionObservationMessage(
      chatEntity,
      '<vision_observation status="ok">Summary</vision_observation>',
      {
        type: 'telegram',
        direction: 'inbound',
        peerId: '123'
      }
    )

    expect(entity.id).toBe(102)
    expect(saveMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({
        role: 'user',
        source: MESSAGE_SOURCE.VISION_OBSERVATION,
        content: '<vision_observation status="ok">Summary</vision_observation>',
        host: expect.objectContaining({
          type: 'telegram',
          peerId: '123'
        })
      })
    }))
    expect(updateChatMock).toHaveBeenCalledWith(expect.objectContaining({
      messages: [102]
    }))
  })

  it('writes usage totalTokens into the finalized assistant message', async () => {
    const store = new ChatStepStore()
    const chatEntity = {
      id: 1,
      uuid: 'chat-1',
      title: 'Chat',
      messages: [],
      createTime: 1,
      updateTime: 1
    } as unknown as ChatEntity
    const finalAssistantMessage: MessageEntity = {
      chatId: 1,
      chatUuid: 'chat-1',
      body: {
        createdAt: 1,
        role: 'assistant',
        model: 'model-1',
        content: 'hello',
        segments: [],
        typewriterCompleted: false
      }
    }
    const usage: ITokenUsage = {
      promptTokens: 12,
      completionTokens: 8,
      totalTokens: 20,
      promptCacheHitTokens: 10,
      promptCacheMissTokens: 2,
      reasoningTokens: 3
    }

    const result = await store.finalizeAssistantMessage(chatEntity, finalAssistantMessage, usage)

    expect(result.id).toBe(102)
    expect(result.tokens).toBe(20)
    expect(result.tokenUsage).toEqual(usage)
    expect(saveMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      tokens: 20,
      tokenUsage: usage,
      body: expect.objectContaining({
        content: 'hello',
        typewriterCompleted: true
      })
    }))
    expect(updateChatMock).toHaveBeenCalledWith(expect.objectContaining({
      messages: [102]
    }))
  })

  it('preserves the latest persisted chat title when attaching a message', async () => {
    const store = new ChatStepStore()
    const staleChatEntity = {
      id: 1,
      uuid: 'chat-1',
      title: 'NewChat',
      messages: [100],
      createTime: 1,
      updateTime: 1
    } as unknown as ChatEntity
    getChatByIdMock.mockReturnValue({
      ...staleChatEntity,
      title: 'Generated title',
      messages: [100]
    })
    saveMessageMock.mockReturnValue(103)

    store.createUserMessage(staleChatEntity, {
      id: 'model-1',
      label: 'model-1',
      type: 'llm'
    } as AccountModel, {
      textCtx: 'hello',
      mediaCtx: []
    })

    expect(updateChatMock).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Generated title',
      messages: [100, 103]
    }))
  })

  it('does not duplicate message ids when attaching a message already present on the latest chat', async () => {
    const store = new ChatStepStore()
    const chatEntity = {
      id: 1,
      uuid: 'chat-1',
      title: 'Generated title',
      messages: [104],
      createTime: 1,
      updateTime: 1
    } as unknown as ChatEntity
    getChatByIdMock.mockReturnValue(chatEntity)
    saveMessageMock.mockReturnValue(104)

    store.createUserMessage(chatEntity, {
      id: 'model-1',
      label: 'model-1',
      type: 'llm'
    } as AccountModel, {
      textCtx: 'hello',
      mediaCtx: []
    })

    expect(updateChatMock).toHaveBeenCalledWith(expect.objectContaining({
      messages: [104]
    }))
  })

  it('skips aborted assistant messages with unanswered tool calls', async () => {
    const store = new ChatStepStore()
    const chatEntity = {
      id: 1,
      uuid: 'chat-1',
      title: 'Chat',
      messages: [],
      createTime: 1,
      updateTime: 1
    } as unknown as ChatEntity

    const result = await store.settleAbortedAssistantMessage(chatEntity, {
      chatId: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'assistant',
        content: '',
        segments: [],
        toolCalls: [{
          id: 'call-1',
          type: 'function',
          function: {
            name: 'execute_command',
            arguments: '{}'
          }
        }]
      }
    } as MessageEntity)

    expect(result).toBeUndefined()
    expect(saveMessageMock).toHaveBeenCalledTimes(0)
  })

  it('settles aborted assistant messages when current run already has tool messages', async () => {
    const store = new ChatStepStore()
    const chatEntity = {
      id: 1,
      uuid: 'chat-1',
      title: 'Chat',
      messages: [],
      createTime: 1,
      updateTime: 1
    } as unknown as ChatEntity
    const toolResultMessage = {
      id: 201,
      chatId: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'tool',
        toolCallId: 'call-1',
        name: 'execute_command',
        content: 'aborted',
        segments: []
      }
    } as MessageEntity

    const result = await store.settleAbortedAssistantMessage(chatEntity, {
      chatId: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'assistant',
        content: '',
        segments: [],
        toolCalls: [{
          id: 'call-1',
          type: 'function',
          function: {
            name: 'execute_command',
            arguments: '{}'
          }
        }]
      }
    } as MessageEntity, [toolResultMessage])

    expect(result?.id).toBe(102)
    expect(saveMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({
        role: 'assistant',
        toolCalls: expect.arrayContaining([
          expect.objectContaining({ id: 'call-1' })
        ])
      })
    }))
  })

  it('persists a hidden run-stopped boundary message', () => {
    const store = new ChatStepStore()
    const chatEntity = {
      id: 1,
      uuid: 'chat-1',
      title: 'Chat',
      messages: [],
      createTime: 1,
      updateTime: 1
    } as unknown as ChatEntity

    const result = store.persistRunStoppedBoundaryMessage(chatEntity, {
      chatId: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'assistant',
        model: 'model-1',
        modelRef: {
          accountId: 'account-1',
          modelId: 'model-1'
        },
        content: '',
        segments: []
      }
    } as MessageEntity, {
      submissionId: 'submission-1'
    })

    expect(result.id).toBe(102)
    expect(saveMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({
        role: 'assistant',
        source: MESSAGE_SOURCE.RUN_STOPPED,
        model: 'model-1',
        modelRef: {
          accountId: 'account-1',
          modelId: 'model-1'
        },
        content: expect.stringContaining('<run_boundary status="stopped" reason="user_cancelled">'),
        runBoundary: expect.objectContaining({
          status: 'stopped',
          reason: 'user_cancelled',
          submissionId: 'submission-1',
          stoppedAt: expect.any(Number)
        }),
        typewriterCompleted: true
      })
    }))
    expect(updateChatMock).toHaveBeenCalledWith(expect.objectContaining({
      messages: [102]
    }))
  })

  it('reuses an existing run-stopped boundary for the same submission', () => {
    const store = new ChatStepStore()
    const chatEntity = {
      id: 1,
      uuid: 'chat-1',
      title: 'Chat',
      messages: [201],
      createTime: 1,
      updateTime: 1
    } as unknown as ChatEntity
    const existingBoundary = {
      id: 201,
      chatId: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'assistant',
        source: MESSAGE_SOURCE.RUN_STOPPED,
        content: '<run_boundary status="stopped" reason="user_cancelled"></run_boundary>',
        runBoundary: {
          status: 'stopped',
          reason: 'user_cancelled',
          submissionId: 'submission-1',
          stoppedAt: 1
        },
        segments: []
      }
    } as MessageEntity

    getChatByIdMock.mockReturnValue(chatEntity)
    getMessageByIdMock.mockReturnValue(existingBoundary)

    const result = store.persistRunStoppedBoundaryMessage(chatEntity, undefined, {
      submissionId: 'submission-1'
    })

    expect(result).toBe(existingBoundary)
    expect(saveMessageMock).not.toHaveBeenCalled()
    expect(updateChatMock).not.toHaveBeenCalled()
  })
})

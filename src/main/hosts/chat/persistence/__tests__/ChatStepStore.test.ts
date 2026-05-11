import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  saveMessageMock,
  updateChatMock,
  getChatByIdMock,
  getChatByUuidMock,
  getEmotionStateByChatIdMock,
  upsertEmotionStateMock
} = vi.hoisted(() => ({
  saveMessageMock: vi.fn(),
  updateChatMock: vi.fn(),
  getChatByIdMock: vi.fn(),
  getChatByUuidMock: vi.fn(),
  getEmotionStateByChatIdMock: vi.fn(),
  upsertEmotionStateMock: vi.fn()
}))

vi.mock('@main/db/DatabaseService', () => ({
  default: {
    saveMessage: saveMessageMock,
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

describe('ChatStepStore.finalizeAssistantMessage', () => {
  beforeEach(() => {
    saveMessageMock.mockReset()
    saveMessageMock.mockReturnValue(102)
    updateChatMock.mockReset()
    getChatByIdMock.mockReset()
    getChatByIdMock.mockReturnValue(undefined)
    getChatByUuidMock.mockReset()
    getChatByUuidMock.mockReturnValue(undefined)
    getEmotionStateByChatIdMock.mockReset()
    upsertEmotionStateMock.mockReset()
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
      totalTokens: 20
    }

    const result = await store.finalizeAssistantMessage(chatEntity, finalAssistantMessage, usage)

    expect(result.id).toBe(102)
    expect(result.tokens).toBe(20)
    expect(saveMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      tokens: 20,
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
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  saveMessageMock,
  updateChatMock,
  getEmotionStateByChatIdMock,
  upsertEmotionStateMock
} = vi.hoisted(() => ({
  saveMessageMock: vi.fn(),
  updateChatMock: vi.fn(),
  getEmotionStateByChatIdMock: vi.fn(),
  upsertEmotionStateMock: vi.fn()
}))

vi.mock('@main/db/DatabaseService', () => ({
  default: {
    saveMessage: saveMessageMock,
    updateChat: updateChatMock,
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
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  updateMessageMock,
  getEmotionStateByChatIdMock,
  upsertEmotionStateMock
} = vi.hoisted(() => ({
  updateMessageMock: vi.fn(),
  getEmotionStateByChatIdMock: vi.fn(),
  upsertEmotionStateMock: vi.fn()
}))

vi.mock('@main/db/DatabaseService', () => ({
  default: {
    updateMessage: updateMessageMock,
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
    updateMessageMock.mockReset()
    getEmotionStateByChatIdMock.mockReset()
    upsertEmotionStateMock.mockReset()
  })

  it('writes usage totalTokens into the finalized assistant message', async () => {
    const store = new ChatStepStore()
    const placeholder: MessageEntity = {
      id: 102,
      chatId: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'assistant',
        content: '',
        segments: [],
        typewriterCompleted: false
      }
    }
    const finalAssistantMessage: MessageEntity = {
      ...placeholder,
      body: {
        role: 'assistant',
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

    const result = await store.finalizeAssistantMessage(placeholder, finalAssistantMessage, usage)

    expect(result.tokens).toBe(20)
    expect(updateMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 102,
      tokens: 20,
      body: expect.objectContaining({
        content: 'hello',
        typewriterCompleted: true
      })
    }))
  })
})

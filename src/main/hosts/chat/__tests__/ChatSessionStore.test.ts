import { describe, expect, it, vi } from 'vitest'

const { updateChatMock, getChatByIdMock } = vi.hoisted(() => ({
  updateChatMock: vi.fn(),
  getChatByIdMock: vi.fn()
}))

vi.mock('@main/db/DatabaseService', () => ({
  default: {
    updateChat: updateChatMock,
    getChatById: getChatByIdMock
  }
}))

import { ChatSessionStore } from '../persistence/ChatSessionStore'

describe('ChatSessionStore.finalizeChatEntity', () => {
  it('keeps NewChat for a fresh chat so post-run title generation can run', () => {
    const store = new ChatSessionStore()
    const chatEntity = {
      id: 1,
      uuid: 'chat-1',
      title: 'NewChat',
      messages: [],
      modelRef: { accountId: 'account-1', modelId: 'model-1' },
      workspacePath: './workspaces/chat-1',
      userInstruction: '',
      createTime: 1,
      updateTime: 1
    } as ChatEntity

    getChatByIdMock.mockReturnValue({
      ...chatEntity,
      title: 'NewChat'
    })

    const result = store.finalizeChatEntity(chatEntity, '小家伙下午好啊', {
      accountId: 'account-2',
      modelId: 'model-2'
    })

    expect(updateChatMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 1,
      title: 'NewChat',
      modelRef: {
        accountId: 'account-2',
        modelId: 'model-2'
      }
    }))
    expect(result.title).toBe('NewChat')
  })

  it('preserves an existing non-default title', () => {
    const store = new ChatSessionStore()
    const chatEntity = {
      id: 2,
      uuid: 'chat-2',
      title: 'Existing title',
      messages: [],
      modelRef: { accountId: 'account-1', modelId: 'model-1' },
      workspacePath: './workspaces/chat-2',
      userInstruction: '',
      createTime: 1,
      updateTime: 1
    } as ChatEntity

    getChatByIdMock.mockReturnValue(chatEntity)

    const result = store.finalizeChatEntity(chatEntity, 'ignored input', {
      accountId: 'account-2',
      modelId: 'model-2'
    })

    expect(updateChatMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 2,
      title: 'Existing title',
      modelRef: {
        accountId: 'account-2',
        modelId: 'model-2'
      }
    }))
    expect(result.title).toBe('Existing title')
  })
})

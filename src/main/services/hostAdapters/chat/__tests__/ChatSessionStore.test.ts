import { describe, expect, it, vi } from 'vitest'

const { updateChatMock, getChatByIdMock } = vi.hoisted(() => ({
  updateChatMock: vi.fn(),
  getChatByIdMock: vi.fn()
}))

vi.mock('@main/services/DatabaseService', () => ({
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
      model: 'model-1',
      workspacePath: './workspaces/chat-1',
      userInstruction: '',
      createTime: 1,
      updateTime: 1
    } as ChatEntity

    getChatByIdMock.mockReturnValue({
      ...chatEntity,
      title: 'NewChat'
    })

    const result = store.finalizeChatEntity(chatEntity, '小家伙下午好啊', 'model-2')

    expect(updateChatMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 1,
      title: 'NewChat',
      model: 'model-2'
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
      model: 'model-1',
      workspacePath: './workspaces/chat-2',
      userInstruction: '',
      createTime: 1,
      updateTime: 1
    } as ChatEntity

    getChatByIdMock.mockReturnValue(chatEntity)

    const result = store.finalizeChatEntity(chatEntity, 'ignored input', 'model-2')

    expect(updateChatMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 2,
      title: 'Existing title',
      model: 'model-2'
    }))
    expect(result.title).toBe('Existing title')
  })
})

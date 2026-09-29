import { beforeEach, describe, expect, it, vi } from 'vitest'

const { updateChatMock, getChatByIdMock, getMessagesByChatUuidMock, saveChatMock } = vi.hoisted(() => ({
  updateChatMock: vi.fn(),
  getChatByIdMock: vi.fn(),
  getMessagesByChatUuidMock: vi.fn(),
  saveChatMock: vi.fn()
}))

vi.mock('electron', () => ({ app: { getPath: (): string => '/tmp/approval-mode-test' } }))
vi.mock('node:fs/promises', () => ({ default: { mkdir: vi.fn().mockResolvedValue(undefined) } }))

vi.mock('@main/db/DatabaseService', () => ({
  default: {
    updateChat: updateChatMock,
    getChatById: getChatByIdMock,
    getMessagesByChatUuid: getMessagesByChatUuidMock,
    saveChat: saveChatMock
  }
}))

import { ChatSessionStore } from '../persistence/ChatSessionStore'

describe('ChatSessionStore', () => {
  beforeEach(() => {
    updateChatMock.mockReset()
    getChatByIdMock.mockReset()
    getMessagesByChatUuidMock.mockReset()
    saveChatMock.mockReset().mockReturnValue(1)
  })

  it.each(['manual', 'auto'] as const)('persists the selected %s mode as a new chat snapshot', async mode => {
    const result = await new ChatSessionStore().resolveOrCreateChat({
      submissionId: 'submission-1',
      input: { textCtx: 'hello', permissionApprovalMode: mode },
      modelRef: { accountId: 'account-1', modelId: 'model-1' }
    } as never)
    expect(saveChatMock).toHaveBeenCalledWith(expect.objectContaining({ permissionApprovalMode: mode }))
    expect(result.permissionApprovalMode).toBe(mode)
  })

  it('preserves an existing chat mode when resolving a run', async () => {
    const existing = { id: 1, uuid: 'chat-1', permissionApprovalMode: 'manual' } as ChatEntity
    getChatByIdMock.mockReturnValue(existing)
    const result = await new ChatSessionStore().resolveOrCreateChat({
      chatId: 1,
      input: { permissionApprovalMode: 'auto' }
    } as never)
    expect(result).toBe(existing)
    expect(saveChatMock).not.toHaveBeenCalled()
  })

  it('loads raw persisted tool-result history', () => {
    const messages = [{
      id: 42,
      chatUuid: 'chat-1',
      body: {
        role: 'tool',
        name: 'web_fetch',
        toolCallId: 'call-42',
        content: 'raw result',
        segments: []
      }
    }]
    getMessagesByChatUuidMock.mockReturnValue(messages)

    const result = new ChatSessionStore().loadHistoryMessages({
      uuid: 'chat-1'
    } as ChatEntity)

    expect(result).toBe(messages)
    expect(getMessagesByChatUuidMock).toHaveBeenCalledWith('chat-1')
  })

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

  it('uses chatModelRef when the execution model differs from the chat model', () => {
    const store = new ChatSessionStore()
    const chatEntity = {
      id: 4,
      uuid: 'chat-4',
      title: 'NewChat',
      messages: [],
      modelRef: { accountId: 'account-main', modelId: 'model-main' },
      workspacePath: './workspaces/chat-4',
      userInstruction: '',
      createTime: 1,
      updateTime: 1
    } as ChatEntity

    getChatByIdMock.mockReturnValue(chatEntity)

    store.finalizeChatEntity(
      chatEntity,
      'image input',
      {
        accountId: 'account-vision',
        modelId: 'model-vision'
      },
      {
        accountId: 'account-main',
        modelId: 'model-main'
      }
    )

    expect(updateChatMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 4,
      modelRef: {
        accountId: 'account-main',
        modelId: 'model-main'
      }
    }))
  })

  it('preserves a generated title from the latest persisted chat', () => {
    const store = new ChatSessionStore()
    const staleChatEntity = {
      id: 3,
      uuid: 'chat-3',
      title: 'NewChat',
      messages: [],
      modelRef: { accountId: 'account-1', modelId: 'model-1' },
      workspacePath: './workspaces/chat-3',
      userInstruction: '',
      createTime: 1,
      updateTime: 1
    } as ChatEntity
    const latestChatEntity = {
      ...staleChatEntity,
      title: 'Generated title'
    }

    getChatByIdMock.mockReturnValue(latestChatEntity)

    const result = store.finalizeChatEntity(staleChatEntity, 'ignored input', {
      accountId: 'account-2',
      modelId: 'model-2'
    })

    expect(updateChatMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 3,
      title: 'Generated title',
      modelRef: {
        accountId: 'account-2',
        modelId: 'model-2'
      }
    }))
    expect(result.title).toBe('Generated title')
  })
})

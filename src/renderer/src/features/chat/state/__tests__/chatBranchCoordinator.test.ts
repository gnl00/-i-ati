import { beforeEach, describe, expect, it, vi } from 'vitest'

const persistenceMocks = vi.hoisted(() => ({
  forkChat: vi.fn(),
  getChatById: vi.fn()
}))

vi.mock('@renderer/infrastructure/persistence/ChatRepository', () => persistenceMocks)

import {
  ChatForkInProgressError,
  createChatCoordinatorActions
} from '../chatCoordinatorStore'

describe('chat branch coordinator', () => {
  beforeEach(() => {
    persistenceMocks.forkChat.mockReset()
    persistenceMocks.getChatById.mockReset()
  })

  it('switches the shell, transcript, model, and scroll target to the physical branch', async () => {
    const branchChat: ChatEntity = {
      id: 2,
      uuid: 'branch-chat',
      title: 'Source chat',
      messages: [101, 102],
      modelRef: { accountId: 'account-1', modelId: 'model-1' },
      createTime: 1_000,
      updateTime: 1_000
    }
    const branchMessages: MessageEntity[] = [
      {
        id: 101,
        chatUuid: 'branch-chat',
        body: { role: 'user', content: 'question', segments: [] }
      },
      {
        id: 102,
        chatUuid: 'branch-chat',
        body: { role: 'assistant', content: 'answer', segments: [] }
      }
    ]
    persistenceMocks.forkChat.mockResolvedValue({
      chat: branchChat,
      messages: branchMessages
    })

    const applyReadyChat = vi.fn()
    const restoreTranscriptForChat = vi.fn()
    const syncSelectedModelRefForChat = vi.fn()
    const setScrollHint = vi.fn()
    const state = {
      currentChatId: 1,
      currentChatUuid: 'source-chat',
      applyReadyChat,
      restoreTranscriptForChat,
      syncSelectedModelRefForChat,
      setScrollHint
    }
    const set = vi.fn()
    const get = (): typeof state => state
    const actions = createChatCoordinatorActions(set as never, get as never)

    const result = await actions.forkCurrentChatFromMessage(42)

    expect(persistenceMocks.forkChat).toHaveBeenCalledWith({
      sourceChatId: 1,
      sourceChatUuid: 'source-chat',
      forkedFromMessageId: 42
    })
    expect(applyReadyChat).toHaveBeenCalledWith(branchChat)
    expect(restoreTranscriptForChat).toHaveBeenCalledWith('branch-chat', branchMessages)
    expect(syncSelectedModelRefForChat).toHaveBeenCalledWith(branchChat, branchMessages)
    expect(setScrollHint).toHaveBeenCalledWith({
      type: 'conversation-switch',
      chatUuid: 'branch-chat',
      index: 1,
      align: 'end'
    })
    expect(result).toEqual({ chat: branchChat, messages: branchMessages })
  })

  it('requires a selected persisted source chat', async () => {
    const state = {
      currentChatId: null,
      currentChatUuid: null
    }
    const actions = createChatCoordinatorActions(vi.fn() as never, (() => state) as never)

    await expect(actions.forkCurrentChatFromMessage(42))
      .rejects.toThrow('Current chat is unavailable')
    expect(persistenceMocks.forkChat).not.toHaveBeenCalled()
  })

  it('allows only one branch request across the active chat', async () => {
    let resolveFirstFork: ((result: ChatForkResult) => void) | undefined
    persistenceMocks.forkChat.mockImplementationOnce(() => new Promise<ChatForkResult>((resolve) => {
      resolveFirstFork = resolve
    }))

    const state = {
      currentChatId: 1,
      currentChatUuid: 'source-chat',
      applyReadyChat: vi.fn(),
      restoreTranscriptForChat: vi.fn(),
      syncSelectedModelRefForChat: vi.fn(),
      setScrollHint: vi.fn()
    }
    const actions = createChatCoordinatorActions(vi.fn() as never, (() => state) as never)
    const firstFork = actions.forkCurrentChatFromMessage(42)

    await expect(actions.forkCurrentChatFromMessage(41))
      .rejects.toBeInstanceOf(ChatForkInProgressError)
    expect(persistenceMocks.forkChat).toHaveBeenCalledTimes(1)

    resolveFirstFork?.({
      chat: {
        id: 2,
        uuid: 'branch-chat',
        title: 'Source chat (1)',
        messages: [101],
        createTime: 1_000,
        updateTime: 1_000
      },
      messages: [{
        id: 101,
        chatUuid: 'branch-chat',
        body: { role: 'assistant', content: 'answer', segments: [] }
      }]
    })
    await firstFork
  })
})

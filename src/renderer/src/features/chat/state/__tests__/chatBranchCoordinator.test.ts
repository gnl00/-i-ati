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
    const setMessagesForChat = vi.fn()
    const syncSelectedModelRefForChat = vi.fn()
    const setScrollHint = vi.fn()
    const state = {
      currentChatId: 1,
      currentChatUuid: 'source-chat',
      applyReadyChat,
      setMessagesForChat,
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
    expect(applyReadyChat).toHaveBeenCalledWith(branchChat, { selectShell: true })
    expect(setMessagesForChat).toHaveBeenCalledWith('branch-chat', branchMessages)
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
      setMessagesForChat: vi.fn(),
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

  it('keeps a newly selected chat active when a branch request resolves late', async () => {
    let resolveFork: ((result: ChatForkResult) => void) | undefined
    persistenceMocks.forkChat.mockImplementationOnce(() => new Promise<ChatForkResult>((resolve) => {
      resolveFork = resolve
    }))

    const applyReadyChat = vi.fn()
    const setMessagesForChat = vi.fn()
    const syncSelectedModelRefForChat = vi.fn()
    const setScrollHint = vi.fn()
    const state = {
      currentChatId: 1,
      currentChatUuid: 'source-chat',
      applyReadyChat,
      setMessagesForChat,
      syncSelectedModelRefForChat,
      setScrollHint
    }
    const actions = createChatCoordinatorActions(vi.fn() as never, (() => state) as never)
    const pendingFork = actions.forkCurrentChatFromMessage(42)

    state.currentChatId = 9
    state.currentChatUuid = 'other-chat'
    const result: ChatForkResult = {
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
    }
    resolveFork?.(result)

    await expect(pendingFork).resolves.toEqual(result)
    expect(applyReadyChat).toHaveBeenCalledWith(result.chat, { selectShell: false })
    expect(setMessagesForChat).toHaveBeenCalledWith('branch-chat', result.messages)
    expect(syncSelectedModelRefForChat).not.toHaveBeenCalled()
    expect(setScrollHint).not.toHaveBeenCalled()
  })

  it('skips every hydration commit when the selection becomes stale during reads', async () => {
    const chat: ChatEntity = {
      id: 3,
      uuid: 'stale-chat',
      title: 'Stale chat',
      messages: [301],
      createTime: 1_000,
      updateTime: 1_000
    }
    const messages: MessageEntity[] = [{
      id: 301,
      chatUuid: chat.uuid,
      body: { role: 'assistant', content: 'answer', segments: [] }
    }]
    let resolveMessages: ((value: MessageEntity[]) => void) | undefined
    let isCurrent = true
    persistenceMocks.getChatById.mockResolvedValue(chat)

    const set = vi.fn()
    const restoreTranscriptForChat = vi.fn()
    const syncSelectedModelRefForChat = vi.fn()
    const state = {
      fetchMessagesByChatUuid: vi.fn(() => new Promise<MessageEntity[]>(resolve => {
        resolveMessages = resolve
      })),
      getRunStatusForChat: vi.fn(() => ({
        runPhase: 'idle',
        postRunJobs: { title: 'idle', compression: 'idle' },
        lastRunOutcome: 'idle'
      })),
      messages: [],
      restoreTranscriptForChat,
      syncSelectedModelRefForChat
    }
    const actions = createChatCoordinatorActions(set as never, (() => state) as never)
    const hydration = actions.hydrateChat(3, { isCurrent: () => isCurrent })

    await Promise.resolve()
    isCurrent = false
    resolveMessages?.(messages)
    await hydration

    expect(set).not.toHaveBeenCalled()
    expect(restoreTranscriptForChat).not.toHaveBeenCalled()
    expect(syncSelectedModelRefForChat).not.toHaveBeenCalled()
  })

  it('checks currentness before restoring and syncing after the shell commit', async () => {
    const chat: ChatEntity = {
      id: 4,
      uuid: 'becomes-stale-chat',
      title: 'Becomes stale',
      messages: [401],
      createTime: 1_000,
      updateTime: 1_000
    }
    const messages: MessageEntity[] = [{
      id: 401,
      chatUuid: chat.uuid,
      body: { role: 'assistant', content: 'answer', segments: [] }
    }]
    let isCurrent = true
    persistenceMocks.getChatById.mockResolvedValue(chat)

    const set = vi.fn(() => {
      isCurrent = false
    })
    const restoreTranscriptForChat = vi.fn()
    const syncSelectedModelRefForChat = vi.fn()
    const state = {
      fetchMessagesByChatUuid: vi.fn().mockResolvedValue(messages),
      getRunStatusForChat: vi.fn(() => ({
        runPhase: 'idle',
        postRunJobs: { title: 'idle', compression: 'idle' },
        lastRunOutcome: 'idle'
      })),
      messages,
      restoreTranscriptForChat,
      syncSelectedModelRefForChat
    }
    const actions = createChatCoordinatorActions(set as never, (() => state) as never)

    await actions.hydrateChat(4, { isCurrent: () => isCurrent })

    expect(set).toHaveBeenCalledTimes(1)
    expect(restoreTranscriptForChat).not.toHaveBeenCalled()
    expect(syncSelectedModelRefForChat).not.toHaveBeenCalled()
  })

  it('keeps a reset chat current when hydration resolves late', async () => {
    const chat: ChatEntity = {
      id: 5,
      uuid: 'stale-after-reset',
      title: 'Stale after reset',
      messages: [501],
      createTime: 1_000,
      updateTime: 1_000
    }
    const messages: MessageEntity[] = [{
      id: 501,
      chatUuid: chat.uuid,
      body: { role: 'assistant', content: 'answer', segments: [] }
    }]
    let resolveMessages: ((value: MessageEntity[]) => void) | undefined
    persistenceMocks.getChatById.mockResolvedValue(chat)

    const set = vi.fn()
    const restoreTranscriptForChat = vi.fn()
    const syncSelectedModelRefForChat = vi.fn()
    const state = {
      fetchMessagesByChatUuid: vi.fn(() => new Promise<MessageEntity[]>(resolve => {
        resolveMessages = resolve
      })),
      getRunStatusForChat: vi.fn(() => ({
        runPhase: 'idle',
        postRunJobs: { title: 'idle', compression: 'idle' },
        lastRunOutcome: 'idle'
      })),
      messages: [],
      restoreTranscriptForChat,
      syncSelectedModelRefForChat
    }
    const actions = createChatCoordinatorActions(set as never, (() => state) as never)
    const hydration = actions.hydrateChat(chat.id!)

    await Promise.resolve()
    actions.resetChatContext()
    resolveMessages?.(messages)
    await hydration

    expect(set).toHaveBeenCalledTimes(1)
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      currentChatId: null,
      currentChatUuid: null
    }))
    expect(restoreTranscriptForChat).not.toHaveBeenCalled()
    expect(syncSelectedModelRefForChat).toHaveBeenCalledWith(null)
    expect(syncSelectedModelRefForChat).not.toHaveBeenCalledWith(chat, messages)
  })

  it('keeps an externally selected shell current when hydration resolves late', async () => {
    const chat: ChatEntity = {
      id: 6,
      uuid: 'stale-before-selection',
      title: 'Stale before selection',
      messages: [601],
      createTime: 1_000,
      updateTime: 1_000
    }
    const messages: MessageEntity[] = [{
      id: 601,
      chatUuid: chat.uuid,
      body: { role: 'assistant', content: 'answer', segments: [] }
    }]
    const selectedChat: ChatEntity = {
      id: 9,
      uuid: 'selected-chat',
      title: 'Selected chat',
      messages: [],
      createTime: 2_000,
      updateTime: 2_000
    }
    let resolveMessages: ((value: MessageEntity[]) => void) | undefined
    persistenceMocks.getChatById.mockResolvedValue(chat)

    const set = vi.fn()
    const restoreTranscriptForChat = vi.fn()
    const state = {
      currentChatId: 1,
      currentChatUuid: 'source-chat',
      chatTitle: 'Source chat',
      chatList: [],
      transcriptBuffersByChatUuid: {},
      fetchMessagesByChatUuid: vi.fn(() => new Promise<MessageEntity[]>(resolve => {
        resolveMessages = resolve
      })),
      getRunStatusForChat: vi.fn(() => ({
        runPhase: 'idle',
        postRunJobs: { title: 'idle', compression: 'idle' },
        lastRunOutcome: 'idle'
      })),
      messages: [],
      restoreTranscriptForChat,
      syncSelectedModelRefForChat: vi.fn()
    }
    const actions = createChatCoordinatorActions(set as never, (() => state) as never)
    const hydration = actions.hydrateChat(chat.id!)

    await Promise.resolve()
    actions.selectChatShell(selectedChat.id!, selectedChat.uuid!, selectedChat)
    resolveMessages?.(messages)
    await hydration

    expect(set).toHaveBeenCalledTimes(1)
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      currentChatId: selectedChat.id,
      currentChatUuid: selectedChat.uuid
    }))
    expect(restoreTranscriptForChat).not.toHaveBeenCalled()
  })

  it.each(['before-hydration', 'chat-read', 'message-read'] as const)(
    'preserves a pending selection across a same-shell ready refresh during %s',
    async phase => {
      const currentChat: ChatEntity = {
        id: 1, uuid: 'chat-a', title: 'A ready', messages: [], createTime: 1, updateTime: 2
      }
      const targetChat: ChatEntity = {
        id: 2, uuid: 'chat-b', title: 'B', messages: [201], createTime: 1, updateTime: 1
      }
      const messages: MessageEntity[] = [{
        id: 201, chatUuid: 'chat-b', body: { role: 'assistant', content: 'B history', segments: [] }
      }]
      let resume!: () => void
      const readGate = new Promise<void>(resolve => { resume = resolve })
      persistenceMocks.getChatById.mockImplementation(async () => {
        if (phase === 'chat-read') await readGate
        return targetChat
      })
      const state = {
        currentChatId: 1,
        currentChatUuid: 'chat-a',
        chatTitle: 'A submitting',
        messages: [] as MessageEntity[],
        scrollHint: { type: 'none' },
        fetchMessagesByChatUuid: vi.fn(async () => {
          if (phase === 'message-read') await readGate
          return messages
        }),
        getRunStatusForChat: vi.fn(() => ({
          runPhase: 'idle',
          postRunJobs: { title: 'idle', compression: 'idle' },
          lastRunOutcome: 'idle'
        })),
        restoreTranscriptForChat: vi.fn((_uuid: string, restored: MessageEntity[]) => {
          state.messages = restored
        }),
        syncSelectedModelRefForChat: vi.fn(),
        updateChatList: vi.fn()
      }
      const actions = createChatCoordinatorActions(
        ((patch: Partial<typeof state>) => Object.assign(state, patch)) as never,
        (() => state) as never
      )
      const selectionEpoch = actions.getSelectionEpoch()
      const isCurrent = (): boolean => actions.getSelectionEpoch() === selectionEpoch
      let hydration: Promise<void> | undefined
      if (phase !== 'before-hydration') {
        hydration = actions.hydrateChat(2, { isCurrent })
        await Promise.resolve()
      }

      // CHAT_READY still targets A while the user's B selection is waiting.
      actions.applyReadyChat(currentChat, { selectShell: true })
      expect(state.chatTitle).toBe('A ready')
      expect(state.updateChatList).toHaveBeenCalledWith(currentChat)
      const epochAfterReady = actions.getSelectionEpoch()
      if (phase === 'before-hydration' && isCurrent()) {
        hydration = actions.hydrateChat(2, { isCurrent })
      }
      resume()
      await hydration

      expect(state.currentChatUuid).toBe('chat-b')
      expect(state.messages).toEqual(messages)
      expect(epochAfterReady).toBe(selectionEpoch)
      expect(state.restoreTranscriptForChat).toHaveBeenCalledWith('chat-b', messages)
      expect(state.syncSelectedModelRefForChat).toHaveBeenCalledWith(targetChat, messages)
      expect(state.scrollHint).toEqual({
        type: 'conversation-switch', chatUuid: 'chat-b', index: 0, align: 'end'
      })
    }
  )

  it.each([
    { id: 10, uuid: 'ready-chat' },
    { id: 1, uuid: 'ready-chat' },
    { id: 10, uuid: 'source-chat' }
  ])('invalidates hydration when applyReadyChat changes shell identity to $id / $uuid', async identity => {
    const chat: ChatEntity = {
      id: 7,
      uuid: 'stale-before-ready-chat',
      title: 'Stale before ready chat',
      messages: [701],
      createTime: 1_000,
      updateTime: 1_000
    }
    const messages: MessageEntity[] = [{
      id: 701,
      chatUuid: chat.uuid,
      body: { role: 'assistant', content: 'answer', segments: [] }
    }]
    const readyChat: ChatEntity = {
      ...identity,
      title: 'Ready chat',
      messages: [],
      createTime: 2_000,
      updateTime: 2_000
    }
    let resolveMessages: ((value: MessageEntity[]) => void) | undefined
    persistenceMocks.getChatById.mockResolvedValue(chat)

    const set = vi.fn()
    const restoreTranscriptForChat = vi.fn()
    const updateChatList = vi.fn()
    const state = {
      currentChatId: 1,
      currentChatUuid: 'source-chat',
      chatTitle: 'Source chat',
      chatList: [],
      transcriptBuffersByChatUuid: {},
      fetchMessagesByChatUuid: vi.fn(() => new Promise<MessageEntity[]>(resolve => {
        resolveMessages = resolve
      })),
      getRunStatusForChat: vi.fn(() => ({
        runPhase: 'idle',
        postRunJobs: { title: 'idle', compression: 'idle' },
        lastRunOutcome: 'idle'
      })),
      messages: [],
      restoreTranscriptForChat,
      syncSelectedModelRefForChat: vi.fn(),
      updateChatList
    }
    const actions = createChatCoordinatorActions(set as never, (() => state) as never)
    const hydration = actions.hydrateChat(chat.id!)

    await Promise.resolve()
    actions.applyReadyChat(readyChat)
    resolveMessages?.(messages)
    await hydration

    expect(updateChatList).toHaveBeenCalledWith(readyChat)
    expect(set).toHaveBeenCalledTimes(1)
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      currentChatId: readyChat.id,
      currentChatUuid: readyChat.uuid
    }))
    expect(restoreTranscriptForChat).not.toHaveBeenCalled()
  })
})

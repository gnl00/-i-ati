import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

type ChatStoreHook = typeof import('../../chatStore')['useChatStore']

const messagePersistenceMocks = vi.hoisted(() => ({
  updateMessage: vi.fn(),
  deleteMessage: vi.fn()
}))

vi.mock('@renderer/services/messages/MessagePersistenceService', () => ({
  messagePersistence: {
    getMessagesByChatUuid: vi.fn(async () => []),
    saveMessage: vi.fn(async () => 1),
    updateMessage: messagePersistenceMocks.updateMessage,
    patchMessageUiState: vi.fn(),
    deleteMessage: messagePersistenceMocks.deleteMessage
  }
}))

let useChatStore: ChatStoreHook

function createMessage(id: number, chatUuid: string, content: string): MessageEntity {
  return {
    id,
    chatUuid,
    body: {
      role: 'assistant',
      content,
      segments: []
    }
  }
}

describe('chat per-chat state buffers', () => {
  beforeAll(async () => {
    vi.stubGlobal('__APP_VERSION__', 'test')
    useChatStore = (await import('../../chatStore')).useChatStore
  })

  beforeEach(() => {
    messagePersistenceMocks.updateMessage.mockReset()
    messagePersistenceMocks.deleteMessage.mockReset()
    useChatStore.setState({
      currentChatId: 2,
      currentChatUuid: 'chat-2',
      messages: [],
      preview: { message: null },
      transcriptBuffersByChatUuid: {},
      runPhase: 'idle',
      postRunJobs: {
        title: 'idle',
        compression: 'idle'
      },
      lastRunOutcome: 'idle',
      runUiByChatUuid: {},
      scrollHint: { type: 'none' }
    })
  })

  it('stores background chat messages outside the visible transcript', () => {
    const message = createMessage(1, 'chat-1', 'background')

    useChatStore.getState().upsertMessageForChat('chat-1', message)

    const state = useChatStore.getState()
    expect(state.messages).toEqual([])
    expect(state.transcriptBuffersByChatUuid['chat-1'].messages).toEqual([message])
  })

  it('restores buffered transcript when a chat becomes visible', () => {
    const persisted = createMessage(1, 'chat-1', 'persisted')
    const streamed = createMessage(2, 'chat-1', 'streamed')
    useChatStore.getState().upsertMessageForChat('chat-1', streamed)

    useChatStore.setState({
      currentChatId: 1,
      currentChatUuid: 'chat-1'
    })
    useChatStore.getState().restoreTranscriptForChat('chat-1', [persisted])

    expect(useChatStore.getState().messages.map(message => message.id)).toEqual([1, 2])
  })

  it('keeps run status scoped by chatUuid', () => {
    useChatStore.getState().setRunPhaseForChat('chat-1', 'streaming')
    useChatStore.getState().setPostRunJobStateForChat('chat-1', 'compression', 'pending')

    let state = useChatStore.getState()
    expect(state.runPhase).toBe('idle')
    expect(state.postRunJobs.compression).toBe('idle')
    expect(state.getRunStatusForChat('chat-1')).toEqual({
      runPhase: 'streaming',
      postRunJobs: {
        title: 'idle',
        compression: 'pending'
      },
      lastRunOutcome: 'idle'
    })

    useChatStore.setState({
      currentChatUuid: 'chat-1'
    })
    useChatStore.getState().restoreRunStatusForChat('chat-1')

    state = useChatStore.getState()
    expect(state.runPhase).toBe('streaming')
    expect(state.postRunJobs.compression).toBe('pending')
  })

  it('updates and deletes messages from a background chat buffer', async () => {
    const original = createMessage(1, 'chat-1', 'error')
    useChatStore.getState().upsertMessageForChat('chat-1', original)

    await useChatStore.getState().updateMessageForChat('chat-1', createMessage(1, 'chat-1', 'fixed'))

    expect(messagePersistenceMocks.updateMessage).toHaveBeenCalledWith(expect.objectContaining({
      id: 1,
      chatUuid: 'chat-1'
    }))
    expect(useChatStore.getState().transcriptBuffersByChatUuid['chat-1'].messages[0].body.content).toBe('fixed')

    await useChatStore.getState().deleteMessageForChat('chat-1', 1)

    expect(messagePersistenceMocks.deleteMessage).toHaveBeenCalledWith(1)
    expect(useChatStore.getState().transcriptBuffersByChatUuid['chat-1'].messages).toEqual([])
  })

  it('tracks and clears optimistic pending user messages', () => {
    useChatStore.getState().setPendingUserMessage({
      submissionId: 'submission-1',
      chatUuid: null,
      text: 'hello',
      mediaCtx: [],
      createdAt: 100
    })

    expect(useChatStore.getState().pendingUserMessage?.text).toBe('hello')

    useChatStore.getState().clearPendingUserMessage('other-submission')
    expect(useChatStore.getState().pendingUserMessage?.submissionId).toBe('submission-1')

    useChatStore.getState().clearPendingUserMessage('submission-1')
    expect(useChatStore.getState().pendingUserMessage).toBeNull()
  })
})

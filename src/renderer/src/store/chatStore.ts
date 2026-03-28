import { getChatById, updateChat } from '@renderer/db/ChatRepository'
import { messagePersistence } from '@renderer/services/messages/MessagePersistenceService'
import { useAppConfigStore } from '@renderer/store/appConfig'
import { resolveExistingChatModelRef, resolveNewChatModelRef, isModelRefAvailable } from '@shared/services/ChatModelResolver'
import { create } from 'zustand'
import { getChatFromList } from '@renderer/utils/chatWorkspace'

export type ChatRunPhase = 'idle' | 'submitting' | 'streaming' | 'post_run' | 'cancelling'
export type PostRunJobStatus = 'idle' | 'pending' | 'failed'
export type PostRunJobsState = {
  title: PostRunJobStatus
  compression: PostRunJobStatus
}
export type ChatRunOutcome = 'idle' | 'completed' | 'failed' | 'aborted'

function hasAssistantPayload(message: ChatMessage): boolean {
  const hasContent = typeof message.content === 'string'
    ? message.content.trim().length > 0
    : Array.isArray(message.content) && message.content.length > 0

  const hasSegments = Array.isArray(message.segments) && message.segments.length > 0
  const hasToolCalls = Array.isArray(message.toolCalls) && message.toolCalls.length > 0

  return hasContent || hasSegments || hasToolCalls
}

function isCompletedEmptyAssistantPlaceholder(message: MessageEntity): boolean {
  return message.body.role === 'assistant'
    && Boolean(message.body.typewriterCompleted)
    && !hasAssistantPayload(message.body)
}

async function trimTrailingCompletedEmptyAssistantPlaceholders(
  messages: MessageEntity[]
): Promise<MessageEntity[]> {
  const trimmed = [...messages]
  const staleIds: number[] = []

  while (trimmed.length > 0) {
    const last = trimmed[trimmed.length - 1]
    if (!isCompletedEmptyAssistantPlaceholder(last)) {
      break
    }

    if (last.id) {
      staleIds.push(last.id)
    }
    trimmed.pop()
  }

  for (const id of staleIds) {
    await messagePersistence.deleteMessage(id)
  }

  return trimmed
}

export type ChatState = {
  // Chat data
  selectedModelRef: ModelRef | undefined
  messages: MessageEntity[]
  imageSrcBase64List: ClipbordImg[]
  currentChatId: number | null
  currentChatUuid: string | null
  chatTitle: string
  chatList: ChatEntity[]
  userInstruction: string
  // Request state
  runPhase: ChatRunPhase
  postRunJobs: PostRunJobsState
  lastRunOutcome: ChatRunOutcome
  // Feature toggles
  webSearchEnable: boolean
  webSearchProcessing: boolean
  artifacts: boolean
  artifactsPanelOpen: boolean
  artifactsActiveTab: string
  // Typewriter control
  forceCompleteTypewriter: (() => void) | null
}

export type ChatAction = {
  // UI 状态更新
  setSelectedModelRef: (ref: ModelRef | undefined) => void
  ensureSelectedModelRef: () => ModelRef | undefined
  syncSelectedModelRefForChat: (chat: ChatEntity | null, messages?: MessageEntity[]) => ModelRef | undefined
  setRunPhase: (phase: ChatRunPhase) => void
  setPostRunJobState: (job: keyof PostRunJobsState, state: PostRunJobStatus) => void
  resetPostRunJobs: () => void
  setLastRunOutcome: (outcome: ChatRunOutcome) => void
  toggleWebSearch: (state: boolean) => void
  setWebSearchProcessState: (state: boolean) => void
  toggleArtifacts: (state: boolean) => void
  toggleArtifactsPanel: () => void
  setArtifactsPanel: (open: boolean) => void
  setArtifactsActiveTab: (tab: string) => void
  setImageSrcBase64List: (imgs: ClipbordImg[]) => void
  setForceCompleteTypewriter: (fn: (() => void) | null) => void
  setChatTitle: (title: string) => void
  setChatList: (list: ChatEntity[]) => void
  updateChatList: (chatEntity: ChatEntity) => void
  setChatId: (chatId: number | null) => void
  setChatUuid: (chatUuid: string | null) => void
  setUserInstruction: (value: string) => void
  updateWorkspacePath: (workspacePath?: string) => Promise<void>

  // 数据操作方法（通过 IPC 与 SQLite 同步）
  loadChat: (chatId: number) => Promise<void>
  loadMessagesByChatUuid: (chatUuid: string) => Promise<MessageEntity[]>
  fetchMessagesByChatUuid: (chatUuid: string) => Promise<MessageEntity[]>
  addMessage: (message: MessageEntity) => Promise<number>
  updateMessage: (message: MessageEntity) => Promise<void>
  patchMessageUiState: (id: number, uiState: { typewriterCompleted?: boolean }) => Promise<void>
  deleteMessage: (messageId: number) => Promise<void>
  settleLatestAssistantAfterAbort: () => Promise<void>
  upsertMessage: (message: MessageEntity) => void
  updateLastAssistantMessageWithError: (error: Error) => Promise<number | undefined>
  clearMessages: () => void
  setCurrentChat: (chatId: number | null, chatUuid: string | null) => void

  // 向后兼容的方法（内部会调用上面新的数据操作方法）
  setMessages: (msgs: MessageEntity[]) => void
}

export const useChatStore = create<ChatState & ChatAction>((set, get) => ({
  // Chat state
  selectedModelRef: undefined,
  messages: [],
  imageSrcBase64List: [],
  currentChatId: null,
  currentChatUuid: null,
  chatTitle: 'NewChat',
  chatList: [],
  userInstruction: '',

  // Request state
  runPhase: 'idle',
  postRunJobs: { title: 'idle', compression: 'idle' },
  lastRunOutcome: 'idle',

  // Feature toggles
  webSearchEnable: false,
  webSearchProcessing: false,
  artifacts: false,
  artifactsPanelOpen: false,
  artifactsActiveTab: 'preview',

  // Typewriter control
  forceCompleteTypewriter: null,

  // ============ UI 状态更新方法 ============

  setSelectedModelRef: (ref) => set({ selectedModelRef: ref }),
  ensureSelectedModelRef: () => {
    const selectedModelRef = get().selectedModelRef
    const appConfig = useAppConfigStore.getState().getAppConfig()
    if (selectedModelRef && isModelRefAvailable(appConfig, selectedModelRef)) {
      return selectedModelRef
    }

    const currentChat = get().currentChatUuid
      ? get().chatList.find(item => item.uuid === get().currentChatUuid)
      : get().chatList.find(item => item.id === get().currentChatId)

    const resolved = currentChat
      ? resolveExistingChatModelRef(appConfig, currentChat, get().messages)
      : resolveNewChatModelRef(appConfig)

    set({ selectedModelRef: resolved })
    return resolved
  },
  syncSelectedModelRefForChat: (chat, messages) => {
    const appConfig = useAppConfigStore.getState().getAppConfig()
    const resolved = chat
      ? resolveExistingChatModelRef(appConfig, chat, messages)
      : resolveNewChatModelRef(appConfig)

    set({ selectedModelRef: resolved })
    return resolved
  },
  setRunPhase: (phase) => set({ runPhase: phase }),
  setPostRunJobState: (job, state) => set((prevState) => ({
    postRunJobs: {
      ...prevState.postRunJobs,
      [job]: state
    }
  })),
  resetPostRunJobs: () => set({
    postRunJobs: {
      title: 'idle',
      compression: 'idle'
    }
  }),
  setLastRunOutcome: (outcome) => set({ lastRunOutcome: outcome }),
  toggleWebSearch: (state) => set({ webSearchEnable: state }),
  setWebSearchProcessState: (state) => set({ webSearchProcessing: state }),
  toggleArtifacts: (state) => set({ artifacts: state }),
  toggleArtifactsPanel: () => set((state) => ({ artifactsPanelOpen: !state.artifactsPanelOpen })),
  setArtifactsPanel: (open) => set({ artifactsPanelOpen: open }),
  setArtifactsActiveTab: (tab) => set({ artifactsActiveTab: tab }),
  setImageSrcBase64List: (imgs) => set({ imageSrcBase64List: imgs }),
  setForceCompleteTypewriter: (fn) => set({ forceCompleteTypewriter: fn }),
  setChatTitle: (title) => set({ chatTitle: title }),
  setChatList: (list) => set({ chatList: list }),
  updateChatList: (chatEntity) => {
    set((state) => ({
      chatList: (() => {
        const existingIndex = state.chatList.findIndex(item => item.uuid === chatEntity.uuid)
        if (existingIndex < 0) {
          return [chatEntity, ...state.chatList]
        }
        return state.chatList.map(item => {
          if (item.uuid !== chatEntity.uuid) return item
          const merged: ChatEntity = {
            ...item,
            ...chatEntity,
            userInstruction: chatEntity.userInstruction ?? item.userInstruction
          }
          return merged
        })
      })(),
      userInstruction:
        state.currentChatUuid === chatEntity.uuid
          ? (chatEntity.userInstruction ?? state.userInstruction)
          : state.userInstruction
    }))
  },
  setChatId: (chatId) => set({ currentChatId: chatId }),
  setChatUuid: (chatUuid) => set({ currentChatUuid: chatUuid }),
  setUserInstruction: (value) => set({ userInstruction: value }),
  updateWorkspacePath: async (workspacePath) => {
    const state = get()
    const chatId = state.currentChatId ?? undefined
    const chatUuid = state.currentChatUuid ?? undefined
    if (!chatId || !chatUuid) return
    const currentChat = getChatFromList({ chatUuid, chatId, chatList: state.chatList })
    if (!currentChat) return

    const updatedChat: ChatEntity = {
      ...currentChat,
      workspacePath,
      updateTime: Date.now()
    }

    await updateChat(updatedChat)
    get().updateChatList(updatedChat)
  },

  // ============ 数据操作方法（通过 IPC 与 SQLite 同步）===========

  /**
   * 从 SQLite 加载聊天及其消息
   * 数据流：SQLite → IPC → Zustand → UI
   */
  loadChat: async (chatId) => {
    // 1. 从 SQLite 加载聊天
    const chat = await getChatById(chatId)
    if (!chat) {
      throw new Error(`Chat not found: ${chatId}`)
    }

    // 2. 从 SQLite 加载消息
    if (!chat.uuid) {
      throw new Error(`Chat missing uuid: ${chatId}`)
    }
    const messages = await trimTrailingCompletedEmptyAssistantPlaceholders(
      await messagePersistence.getMessagesByChatUuid(chat.uuid)
    )

    // 3. 更新 Zustand state（触发 UI 更新）
    set({
      currentChatId: chat.id,
      currentChatUuid: chat.uuid,
      chatTitle: chat.title || 'NewChat',
      userInstruction: chat.userInstruction || '',
      messages: messages
    })
    get().syncSelectedModelRefForChat(chat, messages)
  },

  /**
   * 添加新消息到 SQLite 并更新 Zustand
   * 数据流：UI → Zustand action → IPC → SQLite → 返回 ID → 更新 Zustand → UI
   */
  addMessage: async (message) => {
    const state = get()

    // 1. 通过 IPC 保存到 SQLite
    const msgId = await messagePersistence.saveMessage({
      ...message,
      chatId: state.currentChatId || undefined,
      chatUuid: state.currentChatUuid || undefined
    })

    // 2. 更新内存对象的 ID
    message.id = msgId

    // 3. 更新 Zustand state（触发 UI 更新）
    set((prevState) => ({
      messages: [...prevState.messages, message]
    }))

    return msgId
  },

  /**
   * 加载指定 chatUuid 的消息并更新 Zustand
   * 数据流：SQLite → IPC → Zustand → UI
   */
  loadMessagesByChatUuid: async (chatUuid) => {
    const messages = await trimTrailingCompletedEmptyAssistantPlaceholders(
      await messagePersistence.getMessagesByChatUuid(chatUuid)
    )
    set({ messages })
    return messages
  },

  /**
   * 仅获取指定 chatUuid 的消息（不更新 Zustand）
   */
  fetchMessagesByChatUuid: async (chatUuid) => {
    return await trimTrailingCompletedEmptyAssistantPlaceholders(
      await messagePersistence.getMessagesByChatUuid(chatUuid)
    )
  },

  /**
   * 更新已存在的消息
   * 数据流：UI → Zustand action → IPC → SQLite → 更新 Zustand → UI
   */
  updateMessage: async (message) => {
    if (!message.id) {
      console.warn('[Store] Cannot update message without id')
      return
    }

    // 1. 通过 IPC 更新 SQLite
    await messagePersistence.updateMessage(message)

    // 2. 更新 Zustand state
    set((prevState) => ({
      messages: prevState.messages.map(m => (m.id === message.id ? message : m))
    }))
  },

  patchMessageUiState: async (id, uiState) => {
    await messagePersistence.patchMessageUiState(id, uiState)

    set((prevState) => ({
      messages: prevState.messages.map((message) => (
        message.id === id
          ? {
            ...message,
            body: {
              ...message.body,
              ...(uiState.typewriterCompleted !== undefined
                ? { typewriterCompleted: uiState.typewriterCompleted }
                : {})
            }
          }
          : message
      ))
    }))
  },

  /**
   * 删除消息
   * 数据流：UI → Zustand action → IPC → SQLite → 更新 Zustand → UI
   */
  deleteMessage: async (messageId) => {
    // 1. 通过 IPC 从 SQLite 删除
    await messagePersistence.deleteMessage(messageId)

    // 2. 更新 Zustand state
    set((prevState) => ({
      messages: prevState.messages.filter(m => m.id !== messageId)
    }))
  },

  settleLatestAssistantAfterAbort: async () => {
    const messages = get().messages
    const lastAssistantMessage = [...messages]
      .reverse()
      .find(msg => msg.body.role === 'assistant')

    if (!lastAssistantMessage) {
      return
    }

    if (!hasAssistantPayload(lastAssistantMessage.body)) {
      if (lastAssistantMessage.id) {
        await get().deleteMessage(lastAssistantMessage.id)
      } else {
        set((prevState) => ({
          messages: prevState.messages.filter(message => message !== lastAssistantMessage)
        }))
      }
      return
    }

    if (lastAssistantMessage.id && !lastAssistantMessage.body.typewriterCompleted) {
      await get().patchMessageUiState(lastAssistantMessage.id, { typewriterCompleted: true })
    }
  },

  /**
   * 原子插入或更新消息（仅更新内存，不持久化）
   * 用于流式更新场景，避免频繁的 IPC 调用
   */
  upsertMessage: (message) => {
    set((prevState) => {
      if (!message.id) {
        return {
          messages: [...prevState.messages, message]
        }
      }

      const index = prevState.messages.findIndex((m) => m.id === message.id)
      if (index >= 0) {
        return {
          messages: prevState.messages.map((m) => (m.id === message.id ? message : m))
        }
      }

      return {
        messages: [...prevState.messages, message]
      }
    })
  },

  /**
   * 更新最后一条 assistant 消息，添加错误信息
   * 用于在请求失败时，将错误添加到已创建的初始 assistant 消息中
   */
  updateLastAssistantMessageWithError: async (error) => {
    const state = get()
    const messages = state.messages

    // 找到最后一条 assistant 消息
    const lastAssistantMessage = [...messages]
      .reverse()
      .find(msg => msg.body.role === 'assistant')

    const normalizeErrorCause = (value: unknown):
      { name?: string; message?: string; stack?: string; code?: string } | undefined => {
      if (!value || typeof value !== 'object') return undefined
      const source = value as Record<string, unknown>
      const cause: { name?: string; message?: string; stack?: string; code?: string } = {}
      if (typeof source.name === 'string') cause.name = source.name
      if (typeof source.message === 'string') cause.message = source.message
      if (typeof source.stack === 'string') cause.stack = source.stack
      if (typeof source.code === 'string') cause.code = source.code
      if (!cause.name && !cause.message && !cause.stack && !cause.code) return undefined
      return cause
    }

    const errorSegment: ErrorSegment = {
      type: 'error',
      error: {
        name: error.name || 'Error',
        message: error.message || 'Unknown error',
        stack: error.stack,
        code: (error as any).code,
        cause: normalizeErrorCause((error as any).cause),
        timestamp: Date.now()
      }
    }

    if (!lastAssistantMessage) {
      const fallbackMessage: MessageEntity = {
        body: {
          role: 'assistant',
          model: state.selectedModelRef?.modelId || 'unknown',
          modelRef: state.selectedModelRef
            ? { accountId: state.selectedModelRef.accountId, modelId: state.selectedModelRef.modelId }
            : undefined,
          content: '',
          segments: [errorSegment],
          typewriterCompleted: true
        },
        chatId: state.currentChatId || undefined,
        chatUuid: state.currentChatUuid || undefined
      }
      const msgId = await get().addMessage(fallbackMessage)
      return msgId
    }

    // 更新消息，添加 error segment
    const updatedMessage: MessageEntity = {
      ...lastAssistantMessage,
      body: {
        ...lastAssistantMessage.body,
        segments: [...(lastAssistantMessage.body.segments || []), errorSegment]
      }
    }

    if (updatedMessage.id) {
      await get().updateMessage(updatedMessage)
    } else {
      get().upsertMessage(updatedMessage)
    }
    return updatedMessage.id
  },

  /**
   * 清空消息列表
   */
  clearMessages: () => set({ messages: [] }),

  /**
   * 设置当前聊天
   */
  setCurrentChat: (chatId, chatUuid) => {
    const currentChatId = get().currentChatId
    const currentChatUuid = get().currentChatUuid
    const chat = chatUuid
      ? get().chatList.find(item => item.uuid === chatUuid)
      : get().chatList.find(item => item.id === chatId)

    // 如果切换到不同的聊天，清空消息列表
    if (currentChatId !== chatId || currentChatUuid !== chatUuid) {
      set({
        currentChatId: chatId,
        currentChatUuid: chatUuid,
        chatTitle: chat?.title ?? get().chatTitle,
        messages: [],
        userInstruction: chat?.userInstruction ?? ''
      })
    } else {
      set({
        currentChatId: chatId,
        currentChatUuid: chatUuid,
        userInstruction: chat?.userInstruction ?? get().userInstruction
      })
    }
  },

  // ============ 向后兼容的方法 ============

  /**
   * 向后兼容的 setMessages 方法
   * 注意：新代码应使用 loadChat、addMessage 等方法
   */
  setMessages: (msgs) => set({ messages: msgs })
}))

// 导出类型，供其他文件使用
class Wrapper {
  f() {
    return useChatStore();
  }
}
export type ChatStore = ReturnType<Wrapper["f"]>;

import { getChatById } from '@renderer/db/ChatRepository'
import { getMessageByIds, saveMessage, updateMessage } from '@renderer/db/MessageRepository'
import { create } from 'zustand'

export type ChatState = {
  appVersion: string
  // Chat data
  selectedModel: IModel | undefined
  messages: MessageEntity[]
  imageSrcBase64List: ClipbordImg[]
  currentChatId: number | null
  currentChatUuid: string | null
  // Request state
  fetchState: boolean
  currentReqCtrl: AbortController | undefined
  readStreamState: boolean
  showLoadingIndicator: boolean
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
  setSelectedModel: (mode: IModel) => void
  setFetchState: (state: boolean) => void
  setCurrentReqCtrl: (ctrl: AbortController | undefined) => void
  setReadStreamState: (state: boolean) => void
  setShowLoadingIndicator: (show: boolean) => void
  toggleWebSearch: (state: boolean) => void
  setWebSearchProcessState: (state: boolean) => void
  toggleArtifacts: (state: boolean) => void
  toggleArtifactsPanel: () => void
  setArtifactsPanel: (open: boolean) => void
  setArtifactsActiveTab: (tab: string) => void
  setImageSrcBase64List: (imgs: ClipbordImg[]) => void
  setForceCompleteTypewriter: (fn: (() => void) | null) => void

  // 数据操作方法（通过 IPC 与 SQLite 同步）
  loadChat: (chatId: number) => Promise<void>
  addMessage: (message: MessageEntity) => Promise<number>
  updateMessage: (message: MessageEntity) => Promise<void>
  upsertMessage: (message: MessageEntity) => void
  updateLastAssistantMessageWithError: (error: Error) => Promise<void>
  clearMessages: () => void
  setCurrentChat: (chatId: number | null, chatUuid: string | null) => void

  // 向后兼容的方法（内部会调用上面新的数据操作方法）
  setMessages: (msgs: MessageEntity[]) => void
}

export const useChatStore = create<ChatState & ChatAction>((set, get) => ({
  // @ts-ignore
  appVersion: __APP_VERSION__,

  // Chat state
  selectedModel: undefined,
  messages: [],
  imageSrcBase64List: [],
  currentChatId: null,
  currentChatUuid: null,

  // Request state
  fetchState: false,
  currentReqCtrl: undefined,
  readStreamState: false,
  showLoadingIndicator: false,

  // Feature toggles
  webSearchEnable: false,
  webSearchProcessing: false,
  artifacts: false,
  artifactsPanelOpen: false,
  artifactsActiveTab: 'preview',

  // Typewriter control
  forceCompleteTypewriter: null,

  // ============ UI 状态更新方法 ============

  setSelectedModel: (mode) => set({ selectedModel: mode }),
  setFetchState: (state) => set({ fetchState: state }),
  setCurrentReqCtrl: (ctrl) => set({ currentReqCtrl: ctrl }),
  setReadStreamState: (state) => set({ readStreamState: state }),
  setShowLoadingIndicator: (show) => set({ showLoadingIndicator: show }),
  toggleWebSearch: (state) => set({ webSearchEnable: state }),
  setWebSearchProcessState: (state) => set({ webSearchProcessing: state }),
  toggleArtifacts: (state) => set({ artifacts: state }),
  toggleArtifactsPanel: () => set((state) => ({ artifactsPanelOpen: !state.artifactsPanelOpen })),
  setArtifactsPanel: (open) => set({ artifactsPanelOpen: open }),
  setArtifactsActiveTab: (tab) => set({ artifactsActiveTab: tab }),
  setImageSrcBase64List: (imgs) => set({ imageSrcBase64List: imgs }),
  setForceCompleteTypewriter: (fn) => set({ forceCompleteTypewriter: fn }),

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
    let messages: MessageEntity[] = []
    if (chat.messages && chat.messages.length > 0) {
      messages = await getMessageByIds(chat.messages)
    }

    // 3. 更新 Zustand state（触发 UI 更新）
    set({
      currentChatId: chat.id,
      currentChatUuid: chat.uuid,
      messages: messages
    })
  },

  /**
   * 添加新消息到 SQLite 并更新 Zustand
   * 数据流：UI → Zustand action → IPC → SQLite → 返回 ID → 更新 Zustand → UI
   */
  addMessage: async (message) => {
    const state = get()

    // 1. 通过 IPC 保存到 SQLite
    const msgId = await saveMessage({
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
   * 更新已存在的消息
   * 数据流：UI → Zustand action → IPC → SQLite → 更新 Zustand → UI
   */
  updateMessage: async (message) => {
    if (!message.id) {
      console.warn('[Store] Cannot update message without id')
      return
    }

    // 1. 通过 IPC 更新 SQLite
    await updateMessage(message)

    // 2. 更新 Zustand state
    set((prevState) => ({
      messages: prevState.messages.map(m => (m.id === message.id ? message : m))
    }))
  },

  /**
   * 原子插入或更新消息（仅更新内存，不持久化）
   * 用于流式更新场景，避免频繁的 IPC 调用
   */
  upsertMessage: (message) => {
    set((prevState) => ({
      messages: message.id
        ? prevState.messages.map((m) => (m.id === message.id ? message : m))
        : [...prevState.messages, message]
    }))
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

    if (!lastAssistantMessage) {
      console.warn('[Store] No assistant message found to update with error')
      return
    }

    const errorSegment: ErrorSegment = {
      type: 'error',
      error: {
        name: error.name || 'Error',
        message: error.message || 'Unknown error',
        stack: error.stack,
        code: (error as any).code,
        timestamp: Date.now()
      }
    }

    // 更新消息，添加 error segment
    const updatedMessage: MessageEntity = {
      ...lastAssistantMessage,
      body: {
        ...lastAssistantMessage.body,
        segments: [...lastAssistantMessage.body.segments, errorSegment]
      }
    }

    await get().updateMessage(updatedMessage)
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

    // 如果切换到不同的聊天，清空消息列表
    if (currentChatId !== chatId) {
      set({
        currentChatId: chatId,
        currentChatUuid: chatUuid,
        messages: []
      })
    } else {
      set({
        currentChatId: chatId,
        currentChatUuid: chatUuid
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
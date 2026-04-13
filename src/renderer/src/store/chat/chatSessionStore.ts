import { updateChat } from '@renderer/db/ChatRepository'
import { useAppConfigStore } from '@renderer/store/appConfig'
import { getChatFromList } from '@renderer/utils/chatWorkspace'
import {
  isModelRefAvailable,
  resolveExistingChatModelRef,
  resolveNewChatModelRef
} from '@shared/services/ChatModelResolver'
import type { StateCreator } from 'zustand'

export type ChatSessionState = {
  selectedModelRef: ModelRef | undefined
  currentChatId: number | null
  currentChatUuid: string | null
  chatTitle: string
  chatList: ChatEntity[]
  userInstruction: string
}

export type ChatSessionActions = {
  setSelectedModelRef: (ref: ModelRef | undefined) => void
  ensureSelectedModelRef: () => ModelRef | undefined
  syncSelectedModelRefForChat: (chat: ChatEntity | null, messages?: MessageEntity[]) => ModelRef | undefined
  setChatTitle: (title: string) => void
  replaceChatList: (list: ChatEntity[]) => void
  prependChatListEntry: (chatEntity: ChatEntity) => void
  removeChatListEntry: (chatId: number) => void
  updateChatList: (chatEntity: ChatEntity) => void
  setChatId: (chatId: number | null) => void
  setChatUuid: (chatUuid: string | null) => void
  hydrateUserInstructionDraft: (chat?: ChatEntity | null) => void
  editUserInstructionDraft: (value: string) => void
  applyAssistantInstructionPreset: (value: string) => void
  persistUserInstructionDraft: () => Promise<void>
  updateWorkspacePath: (workspacePath?: string) => Promise<void>
}

type ChatSessionSliceState = ChatSessionState & ChatSessionActions & {
  messages: MessageEntity[]
}

export const createInitialChatSessionState = (): ChatSessionState => ({
  selectedModelRef: undefined,
  currentChatId: null,
  currentChatUuid: null,
  chatTitle: 'NewChat',
  chatList: [],
  userInstruction: ''
})

export function createChatSessionActions<T extends ChatSessionSliceState>(
  set: Parameters<StateCreator<T>>[0],
  get: Parameters<StateCreator<T>>[1]
): ChatSessionActions {
  return {
    setSelectedModelRef: (ref) => set({ selectedModelRef: ref } as Partial<T>),

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

      set({ selectedModelRef: resolved } as Partial<T>)
      return resolved
    },

    syncSelectedModelRefForChat: (chat, messages) => {
      const appConfig = useAppConfigStore.getState().getAppConfig()
      const resolved = chat
        ? resolveExistingChatModelRef(appConfig, chat, messages)
        : resolveNewChatModelRef(appConfig)

      set({ selectedModelRef: resolved } as Partial<T>)
      return resolved
    },

    setChatTitle: (title) => set({ chatTitle: title } as Partial<T>),
    replaceChatList: (list) => set({ chatList: list } as Partial<T>),
    prependChatListEntry: (chatEntity) => set((state) => ({
      chatList: [chatEntity, ...state.chatList.filter(item => item.uuid !== chatEntity.uuid)]
    } as Partial<T>)),
    removeChatListEntry: (chatId) => set((state) => ({
      chatList: state.chatList.filter(item => item.id !== chatId)
    } as Partial<T>)),

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
        chatTitle:
          state.currentChatUuid === chatEntity.uuid
            ? (chatEntity.title || state.chatTitle)
            : state.chatTitle,
        userInstruction:
          state.currentChatUuid === chatEntity.uuid
            ? (chatEntity.userInstruction ?? state.userInstruction)
            : state.userInstruction
      } as Partial<T>))
    },

    setChatId: (chatId) => set({ currentChatId: chatId } as Partial<T>),
    setChatUuid: (chatUuid) => set({ currentChatUuid: chatUuid } as Partial<T>),
    hydrateUserInstructionDraft: (chat) => {
      const resolvedChat = chat === undefined
        ? getChatFromList({
          chatUuid: get().currentChatUuid ?? undefined,
          chatId: get().currentChatId ?? undefined,
          chatList: get().chatList
        })
        : chat

      set({
        userInstruction: resolvedChat?.userInstruction ?? ''
      } as Partial<T>)
    },
    editUserInstructionDraft: (value) => set({ userInstruction: value } as Partial<T>),
    applyAssistantInstructionPreset: (value) => set({ userInstruction: value } as Partial<T>),
    persistUserInstructionDraft: async () => {
      const state = get()
      const currentChat = getChatFromList({
        chatUuid: state.currentChatUuid ?? undefined,
        chatId: state.currentChatId ?? undefined,
        chatList: state.chatList
      })
      if (!currentChat || !currentChat.id) {
        return
      }

      const nextValue = state.userInstruction.trim()
      const currentValue = (currentChat.userInstruction ?? '').trim()
      if (nextValue === currentValue) {
        return
      }

      const updatedChat: ChatEntity = {
        ...currentChat,
        userInstruction: nextValue,
        updateTime: Date.now()
      }

      await updateChat(updatedChat)
      get().updateChatList(updatedChat)
    },

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
    }
  }
}

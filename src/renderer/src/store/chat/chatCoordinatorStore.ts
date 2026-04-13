import { getChatById } from '@renderer/db/ChatRepository'
import type { StateCreator } from 'zustand'
import type { ChatSessionActions, ChatSessionState } from './chatSessionStore'
import type { ChatTranscriptActions, ChatTranscriptState } from './chatTranscriptStore'
import type { ChatRunUiActions, ChatRunUiState } from './chatRunUiStore'

export type ChatCoordinatorActions = {
  hydrateChat: (chatId: number) => Promise<void>
  selectChatShell: (chatId: number | null, chatUuid: string | null, chat?: ChatEntity | null) => void
  resetChatContext: () => void
  applyReadyChat: (chatEntity: ChatEntity) => void
}

type ChatCoordinatorSliceState =
  & ChatSessionState
  & ChatTranscriptState
  & ChatRunUiState
  & ChatSessionActions
  & ChatTranscriptActions
  & ChatRunUiActions

function buildConversationScrollHint(chatUuid: string, messageCount: number): ChatRunUiState['scrollHint'] {
  if (messageCount <= 0) {
    return { type: 'none' }
  }

  return {
    type: 'conversation-switch',
    chatUuid,
    index: messageCount - 1,
    align: 'end'
  }
}

function applyChatShellSelection<T extends ChatCoordinatorSliceState>(
  set: Parameters<StateCreator<T>>[0],
  get: Parameters<StateCreator<T>>[1],
  chatId: number | null,
  chatUuid: string | null,
  chat?: ChatEntity | null
): void {
  const currentChatId = get().currentChatId
  const currentChatUuid = get().currentChatUuid
  const resolvedChat = chatUuid
    ? (chat ?? get().chatList.find(item => item.uuid === chatUuid) ?? null)
    : (chat ?? get().chatList.find(item => item.id === chatId) ?? null)

  const nextTitle = resolvedChat?.title ?? (chatId || chatUuid ? get().chatTitle : 'NewChat')
  const nextUserInstruction = resolvedChat?.userInstruction ?? ''

  if (currentChatId !== chatId || currentChatUuid !== chatUuid) {
    set({
      currentChatId: chatId,
      currentChatUuid: chatUuid,
      chatTitle: nextTitle,
      messages: [] as MessageEntity[],
      preview: {
        message: null
      },
      userInstruction: nextUserInstruction,
      scrollHint: { type: 'none' }
    } as Partial<T>)
    return
  }

  set({
    currentChatId: chatId,
    currentChatUuid: chatUuid,
    chatTitle: nextTitle,
    userInstruction: nextUserInstruction
  } as Partial<T>)
}

export function createChatCoordinatorActions<T extends ChatCoordinatorSliceState>(
  set: Parameters<StateCreator<T>>[0],
  get: Parameters<StateCreator<T>>[1]
): ChatCoordinatorActions {
  return {
    hydrateChat: async (chatId) => {
      const chat = await getChatById(chatId)
      if (!chat) {
        throw new Error(`Chat not found: ${chatId}`)
      }

      if (!chat.uuid) {
        throw new Error(`Chat missing uuid: ${chatId}`)
      }

      const messages = await get().fetchMessagesByChatUuid(chat.uuid)

      set({
        currentChatId: chat.id,
        currentChatUuid: chat.uuid,
        chatTitle: chat.title || 'NewChat',
        userInstruction: chat.userInstruction || '',
        messages,
        preview: {
          message: null
        },
        scrollHint: buildConversationScrollHint(chat.uuid, messages.length)
      } as Partial<T>)

      get().syncSelectedModelRefForChat(chat, messages)
    },

    selectChatShell: (chatId, chatUuid, chat) => {
      applyChatShellSelection(set, get, chatId, chatUuid, chat)
    },

    resetChatContext: () => {
      set({
        currentChatId: null,
        currentChatUuid: null,
        chatTitle: 'NewChat',
        messages: [] as MessageEntity[],
        preview: {
          message: null
        },
        userInstruction: '',
        scrollHint: { type: 'none' }
      } as Partial<T>)

      get().syncSelectedModelRefForChat(null)
    },

    applyReadyChat: (chatEntity) => {
      get().updateChatList(chatEntity)
      applyChatShellSelection(set, get, chatEntity.id ?? null, chatEntity.uuid ?? null, chatEntity)
    }
  }
}

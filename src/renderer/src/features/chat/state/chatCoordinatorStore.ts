import { forkChat, getChatById } from '@renderer/infrastructure/persistence/ChatRepository'
import type { StateCreator } from 'zustand'
import type { ChatSessionActions, ChatSessionState } from './chatSessionStore'
import type { ChatTranscriptActions, ChatTranscriptState } from './chatTranscriptStore'
import type { ChatRunUiActions, ChatRunUiState } from './chatRunUiStore'
import {
  DEFAULT_PERMISSION_APPROVAL_MODE,
  normalizePermissionApprovalMode
} from '@shared/tools/approval'

export type ChatCoordinatorActions = {
  hydrateChat: (chatId: number) => Promise<void>
  forkCurrentChatFromMessage: (forkedFromMessageId: number) => Promise<ChatForkResult>
  selectChatShell: (chatId: number | null, chatUuid: string | null, chat?: ChatEntity | null) => void
  resetChatContext: () => void
  applyReadyChat: (chatEntity: ChatEntity, options?: { selectShell?: boolean }) => void
}

export class ChatForkInProgressError extends Error {
  constructor() {
    super('Chat branch creation is already in progress')
    this.name = 'ChatForkInProgressError'
  }
}

type ChatCoordinatorSliceState =
  & ChatSessionState
  & ChatTranscriptState
  & ChatRunUiState
  & ChatSessionActions
  & ChatTranscriptActions
  & ChatRunUiActions
  & ChatCoordinatorActions

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
  const nextPermissionApprovalMode = normalizePermissionApprovalMode(resolvedChat?.permissionApprovalMode)

  if (currentChatId !== chatId || currentChatUuid !== chatUuid) {
    const transcriptBuffer = chatUuid
      ? get().transcriptBuffersByChatUuid[chatUuid]
      : undefined
    const runStatus = get().getRunStatusForChat(chatUuid)

    set({
      currentChatId: chatId,
      currentChatUuid: chatUuid,
      chatTitle: nextTitle,
      messages: transcriptBuffer?.messages ?? ([] as MessageEntity[]),
      preview: transcriptBuffer?.preview ?? { message: null },
      runPhase: runStatus.runPhase,
      postRunJobs: runStatus.postRunJobs,
      lastRunOutcome: runStatus.lastRunOutcome,
      userInstruction: nextUserInstruction,
      permissionApprovalMode: nextPermissionApprovalMode,
      scrollHint: { type: 'none' }
    } as Partial<T>)
    return
  }

  set({
    currentChatId: chatId,
    currentChatUuid: chatUuid,
    chatTitle: nextTitle,
    userInstruction: nextUserInstruction,
    permissionApprovalMode: nextPermissionApprovalMode
  } as Partial<T>)
}

export function createChatCoordinatorActions<T extends ChatCoordinatorSliceState>(
  set: Parameters<StateCreator<T>>[0],
  get: Parameters<StateCreator<T>>[1]
): ChatCoordinatorActions {
  let isForkInProgress = false

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
      const runStatus = get().getRunStatusForChat(chat.uuid)

      set({
        currentChatId: chat.id,
        currentChatUuid: chat.uuid,
        chatTitle: chat.title || 'NewChat',
        userInstruction: chat.userInstruction || '',
        permissionApprovalMode: normalizePermissionApprovalMode(chat.permissionApprovalMode),
        runPhase: runStatus.runPhase,
        postRunJobs: runStatus.postRunJobs,
        lastRunOutcome: runStatus.lastRunOutcome,
        scrollHint: buildConversationScrollHint(chat.uuid, messages.length)
      } as Partial<T>)
      get().restoreTranscriptForChat(chat.uuid, messages)
      set({
        scrollHint: buildConversationScrollHint(chat.uuid, get().messages.length)
      } as Partial<T>)

      get().syncSelectedModelRefForChat(chat, messages)
    },

    forkCurrentChatFromMessage: async (forkedFromMessageId) => {
      if (isForkInProgress) {
        throw new ChatForkInProgressError()
      }

      const state = get()
      if (!state.currentChatId || !state.currentChatUuid) {
        throw new Error('Current chat is unavailable')
      }
      const sourceChatId = state.currentChatId
      const sourceChatUuid = state.currentChatUuid

      isForkInProgress = true
      try {
        const result = await forkChat({
          sourceChatId,
          sourceChatUuid,
          forkedFromMessageId
        })
        if (!result.chat.id || !result.chat.uuid) {
          throw new Error('Forked chat identity is incomplete')
        }

        const sourceStillSelected = get().currentChatId === sourceChatId
          && get().currentChatUuid === sourceChatUuid
        get().applyReadyChat(result.chat, { selectShell: sourceStillSelected })
        get().setMessagesForChat(result.chat.uuid, result.messages)
        if (!sourceStillSelected) {
          return result
        }

        get().syncSelectedModelRefForChat(result.chat, result.messages)
        get().setScrollHint({
          type: 'conversation-switch',
          chatUuid: result.chat.uuid,
          index: Math.max(0, result.messages.length - 1),
          align: 'end'
        })
        return result
      } finally {
        isForkInProgress = false
      }
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
        pendingUserMessage: null,
        runPhase: 'idle',
        postRunJobs: {
          title: 'idle',
          compression: 'idle'
        },
        lastRunOutcome: 'idle',
        userInstruction: '',
        permissionApprovalMode: DEFAULT_PERMISSION_APPROVAL_MODE,
        scrollHint: { type: 'none' }
      } as Partial<T>)

      get().syncSelectedModelRefForChat(null)
    },

    applyReadyChat: (chatEntity, options = {}) => {
      get().updateChatList(chatEntity)
      if (options.selectShell === false) {
        return
      }
      applyChatShellSelection(set, get, chatEntity.id ?? null, chatEntity.uuid ?? null, chatEntity)
    }
  }
}

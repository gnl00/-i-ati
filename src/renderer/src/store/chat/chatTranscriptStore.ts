import { messagePersistence } from '@renderer/services/messages/MessagePersistenceService'
import { buildMessageSegmentId } from '@shared/chat/segmentId'
import type { MessageSegmentPatch } from '@shared/chat/render-events'
import type { StateCreator } from 'zustand'
import {
  applyMessageSegmentPatchToEntity,
  mergeMessageEntityPreservingSegments
} from '../chatMessagePatch'

export type ChatPreviewState = {
  // Ephemeral assistant overlay projected from run events. Never persisted as transcript history.
  message: MessageEntity | null
}

export type ChatTranscriptState = {
  // Committed transcript history shown in the chat window.
  messages: MessageEntity[]
  // Ephemeral preview state used while a run is still streaming.
  preview: ChatPreviewState
}

export type ChatTranscriptActions = {
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
  patchMessageSegment: (messageId: number, patch: MessageSegmentPatch) => void
  setMessages: (msgs: MessageEntity[]) => void
  // Preview is an ephemeral overlay driven by run-output ingress. It is never persisted as transcript history.
  replacePreviewMessage: (message: MessageEntity | null) => void
  applyPreviewSegmentPatch: (patch: MessageSegmentPatch) => void
  resetPreview: () => void
}

type ChatTranscriptContext = {
  currentChatId: number | null
  currentChatUuid: string | null
  selectedModelRef: ModelRef | undefined
}

type ChatTranscriptSliceState = ChatTranscriptState & ChatTranscriptActions & ChatTranscriptContext

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

export const createInitialChatTranscriptState = (): ChatTranscriptState => ({
  messages: [],
  preview: {
    message: null
  }
})

export function createChatTranscriptActions<T extends ChatTranscriptSliceState>(
  set: Parameters<StateCreator<T>>[0],
  get: Parameters<StateCreator<T>>[1]
): ChatTranscriptActions {
  return {
    loadMessagesByChatUuid: async (chatUuid) => {
      const messages = await trimTrailingCompletedEmptyAssistantPlaceholders(
        await messagePersistence.getMessagesByChatUuid(chatUuid)
      )
      set({
        messages,
        preview: {
          message: null
        }
      } as Partial<T>)
      return messages
    },

    fetchMessagesByChatUuid: async (chatUuid) => {
      return await trimTrailingCompletedEmptyAssistantPlaceholders(
        await messagePersistence.getMessagesByChatUuid(chatUuid)
      )
    },

    addMessage: async (message) => {
      const state = get()
      const msgId = await messagePersistence.saveMessage({
        ...message,
        chatId: state.currentChatId || undefined,
        chatUuid: state.currentChatUuid || undefined
      })

      message.id = msgId

      set((prevState) => ({
        messages: [...prevState.messages, message]
      } as Partial<T>))

      return msgId
    },

    updateMessage: async (message) => {
      if (!message.id) {
        console.warn('[Store] Cannot update message without id')
        return
      }

      await messagePersistence.updateMessage(message)

      set((prevState) => ({
        messages: prevState.messages.map(m => (m.id === message.id ? message : m))
      } as Partial<T>))
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
      } as Partial<T>))
    },

    deleteMessage: async (messageId) => {
      await messagePersistence.deleteMessage(messageId)

      set((prevState) => ({
        messages: prevState.messages.filter(m => m.id !== messageId)
      } as Partial<T>))
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
          await messagePersistence.deleteMessage(lastAssistantMessage.id)
          set((prevState) => ({
            messages: prevState.messages.filter(message => message.id !== lastAssistantMessage.id)
          } as Partial<T>))
        } else {
          set((prevState) => ({
            messages: prevState.messages.filter(message => message !== lastAssistantMessage)
          } as Partial<T>))
        }
        return
      }

      if (lastAssistantMessage.id && !lastAssistantMessage.body.typewriterCompleted) {
        await messagePersistence.patchMessageUiState(lastAssistantMessage.id, { typewriterCompleted: true })
        set((prevState) => ({
          messages: prevState.messages.map((message) => (
            message.id === lastAssistantMessage.id
              ? {
                ...message,
                body: {
                  ...message.body,
                  typewriterCompleted: true
                }
              }
              : message
          ))
        } as Partial<T>))
      }
    },

    upsertMessage: (message) => {
      set((prevState) => {
        if (!message.id) {
          return {
            messages: [...prevState.messages, message]
          } as Partial<T>
        }

        const index = prevState.messages.findIndex((m) => m.id === message.id)
        if (index >= 0) {
          return {
            messages: prevState.messages.map((m) => (
              m.id === message.id ? mergeMessageEntityPreservingSegments(m, message) : m
            ))
          } as Partial<T>
        }

        return {
          messages: [...prevState.messages, message]
        } as Partial<T>
      })
    },

    updateLastAssistantMessageWithError: async (error) => {
      const state = get()
      const messages = state.messages
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
        segmentId: buildMessageSegmentId('error', 'renderer-chat-store', Date.now()),
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

        const msgId = await messagePersistence.saveMessage(fallbackMessage)
        fallbackMessage.id = msgId
        set((prevState) => ({
          messages: [...prevState.messages, fallbackMessage]
        } as Partial<T>))
        return msgId
      }

      const updatedMessage: MessageEntity = {
        ...lastAssistantMessage,
        body: {
          ...lastAssistantMessage.body,
          segments: [...(lastAssistantMessage.body.segments || []), errorSegment]
        }
      }

      if (updatedMessage.id) {
        await messagePersistence.updateMessage(updatedMessage)
        set((prevState) => ({
          messages: prevState.messages.map((message) => (
            message.id === updatedMessage.id ? updatedMessage : message
          ))
        } as Partial<T>))
      } else {
        set((prevState) => ({
          messages: prevState.messages.map((message) => (
            message === lastAssistantMessage ? updatedMessage : message
          ))
        } as Partial<T>))
      }

      return updatedMessage.id
    },

    clearMessages: () => set({
      messages: [] as MessageEntity[],
      preview: {
        message: null
      }
    } as Partial<T>),

    patchMessageSegment: (messageId, patch) => set((prevState) => ({
      messages: prevState.messages.map((message) => (
        message.id === messageId
          ? applyMessageSegmentPatchToEntity(message, patch)
          : message
      ))
    } as Partial<T>)),

    setMessages: (msgs) => set({
      messages: msgs,
      preview: {
        message: null
      }
    } as Partial<T>),

    replacePreviewMessage: (message) => set((prevState) => ({
      preview: {
        message: message && prevState.preview.message
          ? mergeMessageEntityPreservingSegments(prevState.preview.message, message)
          : message
      }
    } as Partial<T>)),

    applyPreviewSegmentPatch: (patch) => set((prevState) => {
      if (!prevState.preview.message) {
        return prevState as Partial<T>
      }

      return {
        preview: {
          message: applyMessageSegmentPatchToEntity(prevState.preview.message, patch)
        }
      } as Partial<T>
    }),

    resetPreview: () => set({
      preview: {
        message: null
      }
    } as Partial<T>)
  }
}

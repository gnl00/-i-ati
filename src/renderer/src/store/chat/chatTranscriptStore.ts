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

export type PendingUserMessageState = {
  submissionId: string
  chatUuid: string | null
  text: string
  mediaCtx: ClipbordImg[] | string[]
  createdAt: number
}

export type ChatTranscriptBufferState = {
  messages: MessageEntity[]
  preview: ChatPreviewState
}

export type ChatTranscriptState = {
  // Committed transcript history shown in the chat window.
  messages: MessageEntity[]
  // Ephemeral preview state used while a run is still streaming.
  preview: ChatPreviewState
  pendingUserMessage: PendingUserMessageState | null
  transcriptBuffersByChatUuid: Record<string, ChatTranscriptBufferState>
}

export type ChatTranscriptActions = {
  loadMessagesByChatUuid: (chatUuid: string) => Promise<MessageEntity[]>
  fetchMessagesByChatUuid: (chatUuid: string) => Promise<MessageEntity[]>
  addMessage: (message: MessageEntity) => Promise<number>
  updateMessage: (message: MessageEntity) => Promise<void>
  updateMessageForChat: (chatUuid: string, message: MessageEntity) => Promise<void>
  patchMessageUiState: (id: number, uiState: { typewriterCompleted?: boolean }) => Promise<void>
  deleteMessage: (messageId: number) => Promise<void>
  deleteMessageForChat: (chatUuid: string, messageId: number) => Promise<void>
  settleLatestAssistantAfterAbort: () => Promise<void>
  upsertMessage: (message: MessageEntity) => void
  upsertMessageForChat: (chatUuid: string, message: MessageEntity) => void
  updateLastAssistantMessageWithError: (error: Error) => Promise<number | undefined>
  clearMessages: () => void
  patchMessageSegment: (messageId: number, patch: MessageSegmentPatch) => void
  patchMessageSegmentForChat: (chatUuid: string, messageId: number, patch: MessageSegmentPatch) => void
  settleLatestAssistantAfterAbortForChat: (chatUuid: string) => Promise<void>
  setMessages: (msgs: MessageEntity[]) => void
  setMessagesForChat: (chatUuid: string, msgs: MessageEntity[]) => void
  restoreTranscriptForChat: (chatUuid: string | null | undefined, persistedMessages: MessageEntity[]) => void
  setPendingUserMessage: (message: PendingUserMessageState | null) => void
  clearPendingUserMessage: (submissionId?: string) => void
  // Preview is an ephemeral overlay driven by run-output ingress. It is never persisted as transcript history.
  replacePreviewMessage: (message: MessageEntity | null) => void
  replacePreviewMessageForChat: (chatUuid: string, message: MessageEntity | null) => void
  applyPreviewSegmentPatch: (patch: MessageSegmentPatch) => void
  applyPreviewSegmentPatchForChat: (chatUuid: string, patch: MessageSegmentPatch) => void
  applyPreviewSegmentPatches: (patches: MessageSegmentPatch[]) => void
  applyPreviewSegmentPatchesForChat: (chatUuid: string, patches: MessageSegmentPatch[]) => void
  resetPreview: () => void
  resetPreviewForChat: (chatUuid: string) => void
  updateLastAssistantMessageWithErrorForChat: (chatUuid: string, error: Error) => Promise<number | undefined>
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

function normalizeErrorCause(value: unknown):
  { name?: string; message?: string; stack?: string; code?: string } | undefined {
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

function buildErrorSegment(error: Error): ErrorSegment {
  return {
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
}

function messageHasMatchingErrorSegment(message: MessageEntity, error: Error): boolean {
  const expectedName = error.name || 'Error'
  const expectedMessage = error.message || 'Unknown error'
  const expectedCode = (error as any).code

  return (message.body.segments || []).some(segment => (
    segment.type === 'error'
    && segment.error.name === expectedName
    && segment.error.message === expectedMessage
    && segment.error.code === expectedCode
  ))
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
  },
  pendingUserMessage: null,
  transcriptBuffersByChatUuid: {}
})

function createEmptyTranscriptBuffer(): ChatTranscriptBufferState {
  return {
    messages: [],
    preview: {
      message: null
    }
  }
}

function mergeMessagesByIdentity(
  baseMessages: MessageEntity[],
  incomingMessages: MessageEntity[]
): MessageEntity[] {
  const nextMessages = [...baseMessages]

  for (const incoming of incomingMessages) {
    if (!incoming.id) {
      nextMessages.push(incoming)
      continue
    }

    const index = nextMessages.findIndex(message => message.id === incoming.id)
    if (index >= 0) {
      nextMessages[index] = mergeMessageEntityPreservingSegments(nextMessages[index], incoming)
    } else {
      nextMessages.push(incoming)
    }
  }

  return nextMessages
}

function upsertMessageIntoList(messages: MessageEntity[], message: MessageEntity): MessageEntity[] {
  if (!message.id) {
    return [...messages, message]
  }

  const index = messages.findIndex((m) => m.id === message.id)
  if (index >= 0) {
    return messages.map((m) => (
      m.id === message.id ? mergeMessageEntityPreservingSegments(m, message) : m
    ))
  }

  return [...messages, message]
}

function patchMessageSegmentInList(
  messages: MessageEntity[],
  messageId: number,
  patch: MessageSegmentPatch
): MessageEntity[] {
  return messages.map((message) => (
    message.id === messageId
      ? applyMessageSegmentPatchToEntity(message, patch)
      : message
  ))
}

function getTranscriptBuffer(
  state: ChatTranscriptState,
  chatUuid: string
): ChatTranscriptBufferState {
  return state.transcriptBuffersByChatUuid[chatUuid] ?? createEmptyTranscriptBuffer()
}

export function createChatTranscriptActions<T extends ChatTranscriptSliceState>(
  set: Parameters<StateCreator<T>>[0],
  get: Parameters<StateCreator<T>>[1]
): ChatTranscriptActions {
  return {
    loadMessagesByChatUuid: async (chatUuid) => {
      const messages = await trimTrailingCompletedEmptyAssistantPlaceholders(
        await messagePersistence.getMessagesByChatUuid(chatUuid)
      )
      const buffer = getTranscriptBuffer(get(), chatUuid)
      const restoredMessages = mergeMessagesByIdentity(messages, buffer.messages)
      set({
        messages: restoredMessages,
        preview: buffer.preview,
        transcriptBuffersByChatUuid: {
          ...get().transcriptBuffersByChatUuid,
          [chatUuid]: {
            messages: restoredMessages,
            preview: buffer.preview
          }
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
      const chatId = message.chatId ?? state.currentChatId ?? undefined
      const chatUuid = message.chatUuid ?? state.currentChatUuid ?? undefined
      const msgId = await messagePersistence.saveMessage({
        ...message,
        chatId,
        chatUuid
      })

      message.id = msgId
      message.chatId = chatId
      message.chatUuid = chatUuid

      set((prevState) => ({
        messages: [...prevState.messages, message],
        ...(chatUuid
          ? {
            transcriptBuffersByChatUuid: {
              ...prevState.transcriptBuffersByChatUuid,
              [chatUuid]: {
                messages: [...getTranscriptBuffer(prevState, chatUuid).messages, message],
                preview: getTranscriptBuffer(prevState, chatUuid).preview
              }
            }
          }
          : {})
      } as Partial<T>))

      return msgId
    },

    updateMessage: async (message) => {
      if (!message.id) {
        console.warn('[Store] Cannot update message without id')
        return
      }

      await messagePersistence.updateMessage(message)

      set((prevState) => {
        const messages = prevState.messages.map(m => (m.id === message.id ? message : m))
        return {
          messages,
          ...(prevState.currentChatUuid
            ? {
              transcriptBuffersByChatUuid: {
                ...prevState.transcriptBuffersByChatUuid,
                [prevState.currentChatUuid]: {
                  messages,
                  preview: prevState.preview
                }
              }
            }
            : {})
        } as Partial<T>
      })
    },

    updateMessageForChat: async (chatUuid, message) => {
      if (!message.id) {
        console.warn('[Store] Cannot update message without id')
        return
      }

      const scopedMessage = {
        ...message,
        chatUuid: message.chatUuid ?? chatUuid
      }

      await messagePersistence.updateMessage(scopedMessage)
      get().upsertMessageForChat(chatUuid, scopedMessage)
    },

    patchMessageUiState: async (id, uiState) => {
      await messagePersistence.patchMessageUiState(id, uiState)

      set((prevState) => {
        const messages = prevState.messages.map((message) => (
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

        return {
          messages,
          ...(prevState.currentChatUuid
            ? {
              transcriptBuffersByChatUuid: {
                ...prevState.transcriptBuffersByChatUuid,
                [prevState.currentChatUuid]: {
                  messages,
                  preview: prevState.preview
                }
              }
            }
            : {})
        } as Partial<T>
      })
    },

    deleteMessage: async (messageId) => {
      await messagePersistence.deleteMessage(messageId)

      set((prevState) => {
        const messages = prevState.messages.filter(m => m.id !== messageId)
        return {
          messages,
          ...(prevState.currentChatUuid
            ? {
              transcriptBuffersByChatUuid: {
                ...prevState.transcriptBuffersByChatUuid,
                [prevState.currentChatUuid]: {
                  messages,
                  preview: prevState.preview
                }
              }
            }
            : {})
        } as Partial<T>
      })
    },

    deleteMessageForChat: async (chatUuid, messageId) => {
      await messagePersistence.deleteMessage(messageId)

      set((prevState) => {
        const buffer = getTranscriptBuffer(prevState, chatUuid)
        const messages = (prevState.currentChatUuid === chatUuid
          ? prevState.messages
          : buffer.messages
        ).filter(m => m.id !== messageId)

        if (prevState.currentChatUuid === chatUuid) {
          return {
            messages,
            transcriptBuffersByChatUuid: {
              ...prevState.transcriptBuffersByChatUuid,
              [chatUuid]: {
                ...buffer,
                messages
              }
            }
          } as Partial<T>
        }

        return {
          transcriptBuffersByChatUuid: {
            ...prevState.transcriptBuffersByChatUuid,
            [chatUuid]: {
              ...buffer,
              messages
            }
          }
        } as Partial<T>
      })
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
      const chatUuid = message.chatUuid ?? get().currentChatUuid
      if (chatUuid) {
        get().upsertMessageForChat(chatUuid, message)
        return
      }

      set((prevState) => {
        return {
          messages: upsertMessageIntoList(prevState.messages, message)
        } as Partial<T>
      })
    },

    upsertMessageForChat: (chatUuid, message) => {
      const scopedMessage = {
        ...message,
        chatUuid: message.chatUuid ?? chatUuid
      }

      set((prevState) => {
        const buffer = getTranscriptBuffer(prevState, chatUuid)
        const bufferMessages = upsertMessageIntoList(buffer.messages, scopedMessage)
        const nextBuffer = {
          ...buffer,
          messages: bufferMessages
        }

        if (prevState.currentChatUuid === chatUuid) {
          const messages = upsertMessageIntoList(prevState.messages, scopedMessage)
          return {
            messages,
            transcriptBuffersByChatUuid: {
              ...prevState.transcriptBuffersByChatUuid,
              [chatUuid]: {
                ...nextBuffer,
                messages
              }
            }
          } as Partial<T>
        }

        return {
          transcriptBuffersByChatUuid: {
            ...prevState.transcriptBuffersByChatUuid,
            [chatUuid]: nextBuffer
          }
        } as Partial<T>
      })
    },

    updateLastAssistantMessageWithError: async (error) => {
      const state = get()
      const messages = state.messages
      const lastAssistantMessage = [...messages]
        .reverse()
        .find(msg => msg.body.role === 'assistant')

      const errorSegment = buildErrorSegment(error)

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

      if (messageHasMatchingErrorSegment(lastAssistantMessage, error)) {
        return lastAssistantMessage.id
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

    clearMessages: () => set((prevState) => {
      const messages = [] as MessageEntity[]
      const preview = {
        message: null
      }
      return {
        messages,
        preview,
        ...(prevState.currentChatUuid
          ? {
            transcriptBuffersByChatUuid: {
              ...prevState.transcriptBuffersByChatUuid,
              [prevState.currentChatUuid]: {
                messages,
                preview
              }
            }
          }
          : {})
      } as Partial<T>
    }),

    patchMessageSegment: (messageId, patch) => {
      const chatUuid = get().currentChatUuid
      if (chatUuid) {
        get().patchMessageSegmentForChat(chatUuid, messageId, patch)
        return
      }

      set((prevState) => ({
        messages: patchMessageSegmentInList(prevState.messages, messageId, patch)
      } as Partial<T>))
    },

    patchMessageSegmentForChat: (chatUuid, messageId, patch) => set((prevState) => {
      const buffer = getTranscriptBuffer(prevState, chatUuid)
      const bufferMessages = patchMessageSegmentInList(buffer.messages, messageId, patch)
      if (prevState.currentChatUuid === chatUuid) {
        const messages = patchMessageSegmentInList(prevState.messages, messageId, patch)
        return {
          messages,
          transcriptBuffersByChatUuid: {
            ...prevState.transcriptBuffersByChatUuid,
            [chatUuid]: {
              ...buffer,
              messages
            }
          }
        } as Partial<T>
      }

      return {
        transcriptBuffersByChatUuid: {
          ...prevState.transcriptBuffersByChatUuid,
          [chatUuid]: {
            ...buffer,
            messages: bufferMessages
          }
        }
      } as Partial<T>
    }),

    settleLatestAssistantAfterAbortForChat: async (chatUuid) => {
      const state = get()
      const sourceMessages = state.currentChatUuid === chatUuid
        ? state.messages
        : getTranscriptBuffer(state, chatUuid).messages
      const lastAssistantMessage = [...sourceMessages]
        .reverse()
        .find(msg => msg.body.role === 'assistant')

      if (!lastAssistantMessage) {
        return
      }

      if (!hasAssistantPayload(lastAssistantMessage.body)) {
        if (lastAssistantMessage.id) {
          await messagePersistence.deleteMessage(lastAssistantMessage.id)
        }
        set((prevState) => {
          const buffer = getTranscriptBuffer(prevState, chatUuid)
          const messages = (prevState.currentChatUuid === chatUuid
            ? prevState.messages
            : buffer.messages
          ).filter(message => (
            lastAssistantMessage.id
              ? message.id !== lastAssistantMessage.id
              : message !== lastAssistantMessage
          ))

          if (prevState.currentChatUuid === chatUuid) {
            return {
              messages,
              transcriptBuffersByChatUuid: {
                ...prevState.transcriptBuffersByChatUuid,
                [chatUuid]: {
                  ...buffer,
                  messages
                }
              }
            } as Partial<T>
          }

          return {
            transcriptBuffersByChatUuid: {
              ...prevState.transcriptBuffersByChatUuid,
              [chatUuid]: {
                ...buffer,
                messages
              }
            }
          } as Partial<T>
        })
        return
      }

      if (lastAssistantMessage.id && !lastAssistantMessage.body.typewriterCompleted) {
        await messagePersistence.patchMessageUiState(lastAssistantMessage.id, { typewriterCompleted: true })
        const updatedMessage = {
          ...lastAssistantMessage,
          body: {
            ...lastAssistantMessage.body,
            typewriterCompleted: true
          }
        }
        get().upsertMessageForChat(chatUuid, updatedMessage)
      }
    },

    setMessages: (msgs) => set((prevState) => {
      const preview = {
        message: null
      }

      return {
        messages: msgs,
        preview,
        pendingUserMessage: null,
        ...(prevState.currentChatUuid
          ? {
            transcriptBuffersByChatUuid: {
              ...prevState.transcriptBuffersByChatUuid,
              [prevState.currentChatUuid]: {
                messages: msgs,
                preview
              }
            }
          }
          : {})
      } as Partial<T>
    }),

    setMessagesForChat: (chatUuid, msgs) => set((prevState) => {
      const nextBuffer = {
        messages: msgs,
        preview: {
          message: null
        }
      }

      if (prevState.currentChatUuid === chatUuid) {
        return {
          messages: msgs,
          preview: nextBuffer.preview,
          transcriptBuffersByChatUuid: {
            ...prevState.transcriptBuffersByChatUuid,
            [chatUuid]: nextBuffer
          }
        } as Partial<T>
      }

      return {
        transcriptBuffersByChatUuid: {
          ...prevState.transcriptBuffersByChatUuid,
          [chatUuid]: nextBuffer
        }
      } as Partial<T>
    }),

    restoreTranscriptForChat: (chatUuid, persistedMessages) => set((prevState) => {
      if (!chatUuid) {
        return {
          messages: [] as MessageEntity[],
          preview: {
            message: null
          },
          pendingUserMessage: null
        } as Partial<T>
      }

      const buffer = getTranscriptBuffer(prevState, chatUuid)
      const messages = mergeMessagesByIdentity(persistedMessages, buffer.messages)
      const preview = buffer.preview

      return {
        messages,
        preview,
        transcriptBuffersByChatUuid: {
          ...prevState.transcriptBuffersByChatUuid,
          [chatUuid]: {
            messages,
            preview
          }
        }
      } as Partial<T>
    }),

    setPendingUserMessage: (message) => set({
      pendingUserMessage: message
    } as Partial<T>),

    clearPendingUserMessage: (submissionId) => set((prevState) => {
      if (!prevState.pendingUserMessage) {
        return prevState as Partial<T>
      }
      if (submissionId && prevState.pendingUserMessage.submissionId !== submissionId) {
        return prevState as Partial<T>
      }

      return {
        pendingUserMessage: null
      } as Partial<T>
    }),

    replacePreviewMessage: (message) => set((prevState) => {
      const preview = {
        message: message && prevState.preview.message
          ? mergeMessageEntityPreservingSegments(prevState.preview.message, message)
          : message
      }

      return {
        preview,
        ...(prevState.currentChatUuid
          ? {
            transcriptBuffersByChatUuid: {
              ...prevState.transcriptBuffersByChatUuid,
              [prevState.currentChatUuid]: {
                messages: prevState.messages,
                preview
              }
            }
          }
          : {})
      } as Partial<T>
    }),

    replacePreviewMessageForChat: (chatUuid, message) => set((prevState) => {
      const buffer = getTranscriptBuffer(prevState, chatUuid)
      const visiblePreviewMessage = prevState.preview.message
      const bufferPreviewMessage = buffer.preview.message
      const preview = {
        message: message && bufferPreviewMessage
          ? mergeMessageEntityPreservingSegments(bufferPreviewMessage, message)
          : message
      }

      if (prevState.currentChatUuid === chatUuid) {
        const visiblePreview = {
          message: message && visiblePreviewMessage
            ? mergeMessageEntityPreservingSegments(visiblePreviewMessage, message)
            : message
        }
        return {
          preview: visiblePreview,
          transcriptBuffersByChatUuid: {
            ...prevState.transcriptBuffersByChatUuid,
            [chatUuid]: {
              ...buffer,
              preview: visiblePreview
            }
          }
        } as Partial<T>
      }

      return {
        transcriptBuffersByChatUuid: {
          ...prevState.transcriptBuffersByChatUuid,
          [chatUuid]: {
            ...buffer,
            preview
          }
        }
      } as Partial<T>
    }),

    applyPreviewSegmentPatch: (patch) => set((prevState) => {
      if (!prevState.preview.message) {
        return prevState as Partial<T>
      }

      const preview = {
        message: applyMessageSegmentPatchToEntity(prevState.preview.message, patch)
      }

      return {
        preview,
        ...(prevState.currentChatUuid
          ? {
            transcriptBuffersByChatUuid: {
              ...prevState.transcriptBuffersByChatUuid,
              [prevState.currentChatUuid]: {
                messages: prevState.messages,
                preview
              }
            }
          }
          : {})
      } as Partial<T>
    }),

    applyPreviewSegmentPatchForChat: (chatUuid, patch) => set((prevState) => {
      const buffer = getTranscriptBuffer(prevState, chatUuid)
      const bufferPreviewMessage = buffer.preview.message

      if (prevState.currentChatUuid === chatUuid) {
        if (!prevState.preview.message) {
          return prevState as Partial<T>
        }

        const preview = {
          message: applyMessageSegmentPatchToEntity(prevState.preview.message, patch)
        }
        return {
          preview,
          transcriptBuffersByChatUuid: {
            ...prevState.transcriptBuffersByChatUuid,
            [chatUuid]: {
              ...buffer,
              preview
            }
          }
        } as Partial<T>
      }

      if (!bufferPreviewMessage) {
        return prevState as Partial<T>
      }

      return {
        transcriptBuffersByChatUuid: {
          ...prevState.transcriptBuffersByChatUuid,
          [chatUuid]: {
            ...buffer,
            preview: {
              message: applyMessageSegmentPatchToEntity(bufferPreviewMessage, patch)
            }
          }
        }
      } as Partial<T>
    }),

    applyPreviewSegmentPatches: (patches) => set((prevState) => {
      if (!prevState.preview.message || patches.length === 0) {
        return prevState as Partial<T>
      }

      const preview = {
        message: patches.reduce(
          (message, patch) => applyMessageSegmentPatchToEntity(message, patch),
          prevState.preview.message
        )
      }

      return {
        preview,
        ...(prevState.currentChatUuid
          ? {
            transcriptBuffersByChatUuid: {
              ...prevState.transcriptBuffersByChatUuid,
              [prevState.currentChatUuid]: {
                messages: prevState.messages,
                preview
              }
            }
          }
          : {})
      } as Partial<T>
    }),

    applyPreviewSegmentPatchesForChat: (chatUuid, patches) => set((prevState) => {
      if (patches.length === 0) {
        return prevState as Partial<T>
      }

      const buffer = getTranscriptBuffer(prevState, chatUuid)
      const bufferPreviewMessage = buffer.preview.message

      if (prevState.currentChatUuid === chatUuid) {
        if (!prevState.preview.message) {
          return prevState as Partial<T>
        }

        const preview = {
          message: patches.reduce(
            (message, patch) => applyMessageSegmentPatchToEntity(message, patch),
            prevState.preview.message
          )
        }
        return {
          preview,
          transcriptBuffersByChatUuid: {
            ...prevState.transcriptBuffersByChatUuid,
            [chatUuid]: {
              ...buffer,
              preview
            }
          }
        } as Partial<T>
      }

      if (!bufferPreviewMessage) {
        return prevState as Partial<T>
      }

      return {
        transcriptBuffersByChatUuid: {
          ...prevState.transcriptBuffersByChatUuid,
          [chatUuid]: {
            ...buffer,
            preview: {
              message: patches.reduce(
                (message, patch) => applyMessageSegmentPatchToEntity(message, patch),
                bufferPreviewMessage
              )
            }
          }
        }
      } as Partial<T>
    }),

    resetPreview: () => set((prevState) => {
      const preview = {
        message: null
      }
      return {
        preview,
        ...(prevState.currentChatUuid
          ? {
            transcriptBuffersByChatUuid: {
              ...prevState.transcriptBuffersByChatUuid,
              [prevState.currentChatUuid]: {
                messages: prevState.messages,
                preview
              }
            }
          }
          : {})
      } as Partial<T>
    }),

    resetPreviewForChat: (chatUuid) => set((prevState) => {
      const buffer = getTranscriptBuffer(prevState, chatUuid)
      const preview = {
        message: null
      }

      if (prevState.currentChatUuid === chatUuid) {
        return {
          preview,
          transcriptBuffersByChatUuid: {
            ...prevState.transcriptBuffersByChatUuid,
            [chatUuid]: {
              ...buffer,
              preview
            }
          }
        } as Partial<T>
      }

      return {
        transcriptBuffersByChatUuid: {
          ...prevState.transcriptBuffersByChatUuid,
          [chatUuid]: {
            ...buffer,
            preview
          }
        }
      } as Partial<T>
    }),

    updateLastAssistantMessageWithErrorForChat: async (chatUuid, error) => {
      const state = get()
      const sourceMessages = state.currentChatUuid === chatUuid
        ? state.messages
        : getTranscriptBuffer(state, chatUuid).messages
      const lastAssistantMessage = [...sourceMessages]
        .reverse()
        .find(msg => msg.body.role === 'assistant')

      const errorSegment = buildErrorSegment(error)

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
          chatId: state.currentChatUuid === chatUuid ? state.currentChatId || undefined : undefined,
          chatUuid
        }

        const msgId = await messagePersistence.saveMessage(fallbackMessage)
        fallbackMessage.id = msgId
        get().upsertMessageForChat(chatUuid, fallbackMessage)
        return msgId
      }

      if (messageHasMatchingErrorSegment(lastAssistantMessage, error)) {
        return lastAssistantMessage.id
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
      }
      get().upsertMessageForChat(chatUuid, updatedMessage)
      return updatedMessage.id
    }
  }
}

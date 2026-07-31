import type { RunEvent } from '@shared/run/events'
import { RUN_STEERING_EVENTS } from '@shared/run/steering-events'
import type { SetStateAction } from 'react'
import { create } from 'zustand'
import {
  mergeQueuedMessages,
  type QueuedChatMessage,
  type QueuedChatMessagePayload
} from './queuePolicy'

const PENDING_QUEUE_KEY = 'pending'

export type ChatInputQueueScope = {
  chatUuid: string | null
  submissionId: string | null
}

export type ChatInputQueueOwner = ChatInputQueueScope & {
  messages: QueuedChatMessage[]
  paused: boolean
  editingMessage: QueuedChatMessage | null
}

type ChatInputQueueState = {
  owners: Record<string, ChatInputQueueOwner>
  setMessages: (
    scope: ChatInputQueueScope,
    update: SetStateAction<QueuedChatMessage[]>
  ) => void
  setPaused: (scope: ChatInputQueueScope, paused: boolean) => void
  beginEditing: (scope: ChatInputQueueScope) => QueuedChatMessage | null
  finishEditing: (
    scope: ChatInputQueueScope,
    replacement?: QueuedChatMessage
  ) => void
  clear: (scope: ChatInputQueueScope) => void
  routeRunEvent: (event: RunEvent, resolvedChatUuid: string | null) => void
}

export const EMPTY_CHAT_INPUT_QUEUE_OWNER: ChatInputQueueOwner = {
  chatUuid: null,
  submissionId: null,
  messages: [],
  paused: false,
  editingMessage: null
}

export function getChatInputQueueKey(scope: ChatInputQueueScope): string {
  if (scope.chatUuid) {
    return `chat:${scope.chatUuid}`
  }
  if (scope.submissionId) {
    return `submission:${scope.submissionId}`
  }
  return PENDING_QUEUE_KEY
}

export function selectQueuedPayloadForFlush(input: {
  owners: Record<string, ChatInputQueueOwner>
  scheduledQueueKey: string
  activeQueueKey: string
}): QueuedChatMessagePayload | null {
  if (input.scheduledQueueKey !== input.activeQueueKey) {
    return null
  }

  const owner = input.owners[input.scheduledQueueKey]
  return mergeQueuedMessages(
    owner?.messages.filter(message => message.status === 'queued') ?? []
  )
}

function createOwner(scope: ChatInputQueueScope): ChatInputQueueOwner {
  return {
    ...scope,
    messages: [],
    paused: false,
    editingMessage: null
  }
}

function isEmptyOwner(owner: ChatInputQueueOwner): boolean {
  return owner.messages.length === 0
    && !owner.paused
    && !owner.editingMessage
}

function updateOwner(
  owners: Record<string, ChatInputQueueOwner>,
  key: string,
  owner: ChatInputQueueOwner
): Record<string, ChatInputQueueOwner> {
  if (isEmptyOwner(owner)) {
    if (!owners[key]) {
      return owners
    }
    const nextOwners = { ...owners }
    delete nextOwners[key]
    return nextOwners
  }

  return { ...owners, [key]: owner }
}

function getOwner(
  owners: Record<string, ChatInputQueueOwner>,
  scope: ChatInputQueueScope
): ChatInputQueueOwner {
  return owners[getChatInputQueueKey(scope)] ?? createOwner(scope)
}

function mergeMessages(
  first: QueuedChatMessage[],
  second: QueuedChatMessage[]
): QueuedChatMessage[] {
  const seenIds = new Set<string>()
  return [...first, ...second].filter(message => {
    if (seenIds.has(message.id)) {
      return false
    }
    seenIds.add(message.id)
    return true
  })
}

function adoptSubmissionOwner(
  owners: Record<string, ChatInputQueueOwner>,
  submissionId: string,
  chatUuid: string
): Record<string, ChatInputQueueOwner> {
  const submissionKey = getChatInputQueueKey({ chatUuid: null, submissionId })
  const chatKey = getChatInputQueueKey({ chatUuid, submissionId })
  const submissionOwner = owners[submissionKey]
  const chatOwner = owners[chatKey]

  if (!submissionOwner && !chatOwner) {
    return owners
  }

  const nextOwner: ChatInputQueueOwner = {
    ...(chatOwner ?? submissionOwner ?? createOwner({ chatUuid, submissionId })),
    chatUuid,
    submissionId,
    messages: mergeMessages(
      chatOwner?.messages ?? [],
      submissionOwner?.messages ?? []
    ),
    editingMessage: chatOwner?.editingMessage ?? submissionOwner?.editingMessage ?? null,
    paused: Boolean(chatOwner?.paused || submissionOwner?.paused)
  }
  const nextOwners = { ...owners, [chatKey]: nextOwner }
  delete nextOwners[submissionKey]
  return nextOwners
}

function findEventOwnerKey(
  owners: Record<string, ChatInputQueueOwner>,
  submissionId: string,
  chatUuid: string | null
): string | null {
  if (chatUuid) {
    const chatKey = getChatInputQueueKey({ chatUuid, submissionId })
    const owner = owners[chatKey]
    if (owner && (!owner.submissionId || owner.submissionId === submissionId)) {
      return chatKey
    }
  }

  const submissionKey = getChatInputQueueKey({ chatUuid: null, submissionId })
  return owners[submissionKey] ? submissionKey : null
}

export const useChatInputQueueStore = create<ChatInputQueueState>((set, get) => ({
  owners: {},

  setMessages: (scope, update): void => {
    set(state => {
      const key = getChatInputQueueKey(scope)
      const owner = getOwner(state.owners, scope)
      const messages = typeof update === 'function'
        ? update(owner.messages)
        : update
      const owners = updateOwner(state.owners, key, {
        ...owner,
        ...scope,
        messages
      })
      return owners === state.owners ? state : { owners }
    })
  },

  setPaused: (scope, paused): void => {
    set(state => {
      const key = getChatInputQueueKey(scope)
      const owner = getOwner(state.owners, scope)
      const owners = updateOwner(state.owners, key, { ...owner, ...scope, paused })
      return owners === state.owners ? state : { owners }
    })
  },

  beginEditing: (scope): QueuedChatMessage | null => {
    const key = getChatInputQueueKey(scope)
    const owner = getOwner(get().owners, scope)
    const first = owner.messages[0]
    if (!first || first.status === 'inserting' || owner.editingMessage) {
      return null
    }

    set(state => ({
      owners: {
        ...state.owners,
        [key]: {
          ...owner,
          ...scope,
          messages: owner.messages.slice(1),
          editingMessage: first
        }
      }
    }))
    return first
  },

  finishEditing: (scope, replacement): void => {
    set(state => {
      const key = getChatInputQueueKey(scope)
      const owner = getOwner(state.owners, scope)
      const owners = updateOwner(state.owners, key, {
        ...owner,
        ...scope,
        messages: replacement ? [replacement, ...owner.messages] : owner.messages,
        editingMessage: null
      })
      return owners === state.owners ? state : { owners }
    })
  },

  clear: (scope): void => {
    set(state => {
      const key = getChatInputQueueKey(scope)
      if (!state.owners[key]) {
        return state
      }
      const owners = { ...state.owners }
      delete owners[key]
      return { owners }
    })
  },

  routeRunEvent: (event, resolvedChatUuid): void => {
    set(state => {
      let owners = state.owners
      if (resolvedChatUuid) {
        owners = adoptSubmissionOwner(owners, event.submissionId, resolvedChatUuid)
      }

      if (
        event.type !== RUN_STEERING_EVENTS.STEERING_CONSUMED
        && event.type !== RUN_STEERING_EVENTS.STEERING_RETURNED
      ) {
        return owners === state.owners ? state : { owners }
      }

      const ownerKey = findEventOwnerKey(owners, event.submissionId, resolvedChatUuid)
      if (!ownerKey) {
        return owners === state.owners ? state : { owners }
      }
      const owner = owners[ownerKey]
      const messages = event.type === RUN_STEERING_EVENTS.STEERING_CONSUMED
        ? owner.messages.filter(message => message.id !== event.payload.queueItemId)
        : ((): QueuedChatMessage[] => {
            const returnedIds = new Set(event.payload.queueItemIds)
            return owner.messages.map(message => (
              returnedIds.has(message.id)
                ? { ...message, status: 'queued' as const }
                : message
            ))
          })()

      const nextOwners = updateOwner(owners, ownerKey, { ...owner, messages })
      return nextOwners === state.owners ? state : { owners: nextOwners }
    })
  }
}))

export function resetChatInputQueueStoreForTests(): void {
  useChatInputQueueStore.setState({ owners: {} })
}

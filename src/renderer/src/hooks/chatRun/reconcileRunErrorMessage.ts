import { useChatStore } from '@renderer/store/chatStore'
import type { SerializedError } from '@shared/run/lifecycle-events'

export type LastRunErrorMessage = {
  id: number
  chatUuid: string | null
}

export function normalizeRunError(error: SerializedError | Error): Error {
  const normalized = new Error(error.message || 'Unknown error')
  normalized.name = error.name || 'Error'
  if (error.stack) {
    normalized.stack = error.stack
  }
  ;(normalized as any).code = (error as any).code
  if (error.cause) {
    ;(normalized as any).cause = error.cause
  }
  return normalized
}

export function getRunFailureDescription(error: SerializedError | Error): string {
  const normalized = normalizeRunError(error)
  const firstLine = (normalized.message || 'Unknown error').split('\n')[0].trim()
  if (firstLine.length <= 180) {
    return firstLine
  }
  return `${firstLine.slice(0, 177)}...`
}

export async function clearPreviousErrorMessage(input: {
  lastErrorMessage: LastRunErrorMessage | null
  clearedErrorMessageIds: Set<number>
}): Promise<LastRunErrorMessage | null> {
  const { lastErrorMessage, clearedErrorMessageIds } = input

  if (!lastErrorMessage) {
    return null
  }

  const state = useChatStore.getState()
  if (
    lastErrorMessage.chatUuid
    && state.currentChatUuid
    && lastErrorMessage.chatUuid !== state.currentChatUuid
  ) {
    return null
  }

  const message = state.messages.find(item => item.id === lastErrorMessage.id)
  if (!message || message.body.role !== 'assistant') {
    return null
  }

  const segments = message.body.segments || []
  const hasError = segments.some(segment => (segment as any).type === 'error')
  if (!hasError) {
    return null
  }

  const hasNonErrorSegments = segments.some(segment => (segment as any).type !== 'error')
  const hasContent = typeof message.body.content === 'string'
    ? message.body.content.trim().length > 0
    : Array.isArray(message.body.content) && message.body.content.length > 0

  if (!hasNonErrorSegments && !hasContent) {
    await state.deleteMessage(lastErrorMessage.id)
    clearedErrorMessageIds.add(lastErrorMessage.id)
    return null
  }

  const updated: MessageEntity = {
    ...message,
    body: {
      ...message.body,
      segments: segments.filter(segment => (segment as any).type !== 'error')
    }
  }
  await state.updateMessage(updated)
  return null
}

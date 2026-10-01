import {
  MESSAGE_SOURCE,
  HIDDEN_MESSAGE_SOURCES,
  isTransportDeliveryMessage
} from '@shared/messages/messageSources'
import { sanitizeRawImageDataUrls } from '@shared/services/RawImageDataSanitizer'

/** Host history projection only. ContextManager owns request budgeting and runtime state. */
export const buildContextMessages = (input: {
  messages: MessageEntity[]
  contexts: ChatMessage[]
  userInstruction?: string | null
  summary?: CompressedSummaryEntity | null
}): ChatMessage[] => {
  const covered = new Set(input.summary?.messageIds ?? [])
  const compatibleSummary =
    input.summary && input.messages.some((message) => message.id === input.summary!.startMessageId)
  const currentUserId = input.messages.findLast(
    (message) =>
      message.body.role === 'user' &&
      (!message.body.source || !HIDDEN_MESSAGE_SOURCES.has(message.body.source))
  )?.id
  const raw = input.messages
    .filter(
      (message) =>
        !isTransportDeliveryMessage(message.body) &&
        !(
          compatibleSummary &&
          message.id !== undefined &&
          message.id !== currentUserId &&
          covered.has(message.id)
        )
    )
    .map((message) => message.body)
  const lastImage = raw.findLastIndex(
    (message) =>
      message.role === 'user' &&
      Array.isArray(message.content) &&
      message.content.some((part) => part.type === 'image_url')
  )
  raw.forEach((message, index) => {
    if (
      index === lastImage ||
      message.role !== 'user' ||
      !Array.isArray(message.content) ||
      !message.content.some((part) => part.type === 'image_url')
    )
      return
    raw[index] = {
      ...message,
      content:
        '[Previous image omitted from history]\n' +
        message.content
          .filter((part) => part.type === 'text')
          .map((part) => part.text)
          .join('\n')
    }
  })
  const result: ChatMessage[] = []
  if (input.userInstruction?.trim())
    result.push({
      role: 'user',
      source: MESSAGE_SOURCE.SYSTEM_PROMPT,
      content: `<user_instruction>\n${input.userInstruction.trim()}\n</user_instruction>`,
      segments: []
    })
  if (compatibleSummary)
    result.push({
      role: 'user',
      source: MESSAGE_SOURCE.COMPRESSION_SUMMARY,
      content: `[Previous conversation summary (${input.summary!.messageIds.length} messages compressed)]\n\n${sanitizeRawImageDataUrls(input.summary!.summary)}`,
      segments: []
    })
  // Persisted failed turns can contain incomplete call pairs. Project only actual matching pairs.
  for (let i = 0; i < raw.length; i++) {
    const message = raw[i]
    if (message.role === 'tool') continue
    if (message.role !== 'assistant') {
      result.push(message)
      continue
    }
    const results: ChatMessage[] = []
    while (raw[i + 1]?.role === 'tool') results.push(raw[++i])
    const calls = (message.toolCalls ?? []).filter((call) =>
      results.some((result) => result.toolCallId === call.id)
    )
    if (calls.length || message.content)
      result.push({ ...message, toolCalls: calls.length ? calls : undefined })
    for (const call of calls) {
      const matching = results.find((result) => result.toolCallId === call.id)!
      result.push(matching)
    }
  }
  const currentUser = result.findLastIndex((message) => message.role === 'user')
  result.splice(currentUser < 0 ? result.length : currentUser, 0, ...input.contexts)
  return result
}

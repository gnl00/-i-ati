import type { MessageRow } from '@main/db/dao/MessageDao'
import { normalizeChatMessageSegmentsWithIds } from '@shared/chat/segmentId'

export const toMessageInsertRow = (message: MessageEntity): Omit<MessageRow, 'id'> => ({
  chat_id: message.chatId ?? null,
  chat_uuid: message.chatUuid ?? null,
  body: JSON.stringify(normalizeChatMessageSegmentsWithIds(
    message.body,
    `db-message:${message.id ?? message.chatUuid ?? message.chatId ?? 'new'}`
  )),
  tokens: message.tokens ?? null
})

export const toMessageRow = (message: MessageEntity): MessageRow => ({
  id: message.id ?? 0,
  ...toMessageInsertRow(message)
})

export const toMessageEntity = (row: MessageRow): MessageEntity => ({
  id: row.id,
  chatId: row.chat_id ?? undefined,
  chatUuid: row.chat_uuid ?? undefined,
  body: normalizeChatMessageSegmentsWithIds(
    JSON.parse(row.body) as ChatMessage,
    `db-message:${row.id}`
  ),
  tokens: row.tokens ?? undefined
})

export const patchMessageRowUiState = (
  row: MessageRow,
  uiState: { typewriterCompleted?: boolean }
): MessageRow => {
  const body = normalizeChatMessageSegmentsWithIds(
    JSON.parse(row.body) as ChatMessage,
    `db-message:${row.id}`
  )
  const nextBody: ChatMessage = {
    ...body,
    ...(uiState.typewriterCompleted !== undefined
      ? { typewriterCompleted: uiState.typewriterCompleted }
      : {})
  }

  return {
    ...row,
    body: JSON.stringify(nextBody)
  }
}

import type { ChatHostBindingRow } from '@main/db/dao/ChatHostBindingDao'

type ChatHostBindingRowOverrides = Partial<Pick<ChatHostBindingRow, 'id' | 'created_at' | 'updated_at'>>

export const toChatHostBindingRow = (
  binding: ChatHostBindingEntity,
  now: number,
  overrides: ChatHostBindingRowOverrides = {}
): ChatHostBindingRow => ({
  id: overrides.id ?? binding.id ?? 0,
  host_type: binding.hostType,
  host_chat_id: binding.hostChatId,
  host_thread_id: binding.hostThreadId ?? null,
  host_user_id: binding.hostUserId ?? null,
  chat_id: binding.chatId,
  chat_uuid: binding.chatUuid,
  last_host_message_id: binding.lastHostMessageId ?? null,
  status: binding.status,
  metadata_json: binding.metadata ? JSON.stringify(binding.metadata) : null,
  created_at: overrides.created_at ?? binding.createTime ?? now,
  updated_at: overrides.updated_at ?? binding.updateTime ?? now
})

export const toChatHostBindingEntity = (
  row: ChatHostBindingRow
): ChatHostBindingEntity | undefined => {
  try {
    return {
      id: row.id,
      hostType: row.host_type,
      hostChatId: row.host_chat_id,
      hostThreadId: row.host_thread_id ?? undefined,
      hostUserId: row.host_user_id ?? undefined,
      chatId: row.chat_id,
      chatUuid: row.chat_uuid,
      lastHostMessageId: row.last_host_message_id ?? undefined,
      status: row.status,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) as Record<string, unknown> : undefined,
      createTime: row.created_at,
      updateTime: row.updated_at
    }
  } catch {
    return undefined
  }
}

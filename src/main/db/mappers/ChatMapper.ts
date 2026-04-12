import type { ChatRow } from '@main/db/dao/ChatDao'

type ChatRowOverrides = Partial<Pick<ChatRow, 'id' | 'create_time' | 'update_time' | 'user_instruction'>>

export const toChatRow = (
  chat: ChatEntity,
  now = Date.now(),
  overrides: ChatRowOverrides = {}
): ChatRow => ({
  id: overrides.id ?? chat.id ?? 0,
  uuid: chat.uuid,
  title: chat.title,
  msg_count: chat.msgCount ?? 0,
  model_account_id: chat.modelRef?.accountId ?? null,
  model_model_id: chat.modelRef?.modelId ?? null,
  workspace_path: chat.workspacePath ?? null,
  user_instruction: overrides.user_instruction ?? chat.userInstruction ?? null,
  create_time: overrides.create_time ?? chat.createTime ?? now,
  update_time: overrides.update_time ?? chat.updateTime ?? now
})

export const toChatEntity = (row: ChatRow): ChatEntity => ({
  id: row.id,
  uuid: row.uuid,
  title: row.title,
  msgCount: row.msg_count,
  modelRef: row.model_account_id && row.model_model_id
    ? {
      accountId: row.model_account_id,
      modelId: row.model_model_id
    }
    : undefined,
  workspacePath: row.workspace_path ?? undefined,
  userInstruction: row.user_instruction ?? undefined,
  createTime: row.create_time,
  updateTime: row.update_time,
  messages: []
})

import type { AssistantRow } from '@main/db/dao/AssistantDao'

export const toAssistantRow = (
  assistant: Assistant,
  now = Date.now()
): AssistantRow => ({
  id: assistant.id,
  name: assistant.name,
  description: assistant.description || null,
  model_account_id: assistant.modelRef.accountId,
  model_model_id: assistant.modelRef.modelId,
  system_prompt: assistant.systemPrompt,
  sort_index: assistant.sortIndex ?? 0,
  created_at: assistant.createdAt ?? now,
  updated_at: assistant.updatedAt ?? now,
  is_built_in: assistant.isBuiltIn ? 1 : 0,
  is_default: assistant.isDefault ? 1 : 0
})

export const toAssistantEntity = (row: AssistantRow): Assistant => ({
  id: row.id,
  name: row.name,
  description: row.description || undefined,
  modelRef: {
    accountId: row.model_account_id,
    modelId: row.model_model_id
  },
  systemPrompt: row.system_prompt,
  sortIndex: row.sort_index ?? 0,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  isBuiltIn: row.is_built_in === 1,
  isDefault: row.is_default === 1
})

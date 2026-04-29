import type { SmartMessageRow } from '@main/db/dao/SmartMessageDao'

export const toSmartMessageRow = (message: SmartMessageEntity): SmartMessageRow => ({
  id: message.id,
  chat_id: message.chatId ?? null,
  chat_uuid: message.chatUuid ?? null,
  source_summary_ids: JSON.stringify(message.sourceSummaryIds),
  source_hash: message.sourceHash,
  title: message.title,
  body: message.body,
  action_prompt: message.actionPrompt,
  reason: message.reason ?? null,
  priority_score: message.priorityScore,
  status: message.status,
  generated_at: message.generatedAt,
  expires_at: message.expiresAt ?? null,
  model_id: message.modelId ?? null,
  generation_version: message.generationVersion
})

export const toSmartMessageEntity = (row: SmartMessageRow): SmartMessageEntity => ({
  id: row.id,
  chatId: row.chat_id ?? undefined,
  chatUuid: row.chat_uuid ?? undefined,
  sourceSummaryIds: JSON.parse(row.source_summary_ids) as number[],
  sourceHash: row.source_hash,
  title: row.title,
  body: row.body,
  actionPrompt: row.action_prompt,
  reason: row.reason ?? undefined,
  priorityScore: row.priority_score,
  status: row.status as SmartMessageStatus,
  generatedAt: row.generated_at,
  expiresAt: row.expires_at ?? undefined,
  modelId: row.model_id ?? undefined,
  generationVersion: row.generation_version
})

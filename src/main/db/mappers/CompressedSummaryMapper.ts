import type { CompressedSummaryRow } from '@main/db/dao/CompressedSummaryDao'

export const toCompressedSummaryInsertRow = (
  summary: CompressedSummaryEntity
): Omit<CompressedSummaryRow, 'id'> => ({
  chat_id: summary.chatId,
  chat_uuid: summary.chatUuid,
  message_ids: JSON.stringify(summary.messageIds),
  start_message_id: summary.startMessageId,
  end_message_id: summary.endMessageId,
  summary: summary.summary,
  original_token_count: summary.originalTokenCount ?? null,
  summary_token_count: summary.summaryTokenCount ?? null,
  compression_ratio: summary.compressionRatio ?? null,
  compressed_at: summary.compressedAt,
  compression_model: summary.compressionModel ?? null,
  compression_version: summary.compressionVersion ?? 1,
  status: summary.status ?? 'active'
})

export const toCompressedSummaryEntity = (row: CompressedSummaryRow): CompressedSummaryEntity => ({
  id: row.id,
  chatId: row.chat_id,
  chatUuid: row.chat_uuid,
  messageIds: JSON.parse(row.message_ids) as number[],
  startMessageId: row.start_message_id,
  endMessageId: row.end_message_id,
  summary: row.summary,
  originalTokenCount: row.original_token_count ?? undefined,
  summaryTokenCount: row.summary_token_count ?? undefined,
  compressionRatio: row.compression_ratio ?? undefined,
  compressedAt: row.compressed_at,
  compressionModel: row.compression_model ?? undefined,
  compressionVersion: row.compression_version ?? undefined,
  status: (row.status as CompressedSummaryEntity['status']) ?? 'active'
})

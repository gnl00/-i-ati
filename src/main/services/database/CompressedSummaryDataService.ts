import type { CompressedSummaryRepository, CompressedSummaryRow } from '@main/db/repositories/CompressedSummaryRepository'

type CompressedSummaryDataServiceDeps = {
  hasDb: () => boolean
  getSummaryRepo: () => CompressedSummaryRepository | undefined
}

export class CompressedSummaryDataService {
  constructor(private readonly deps: CompressedSummaryDataServiceDeps) {}

  saveCompressedSummary(data: CompressedSummaryEntity): number {
    const summaryRepo = this.requireSummaryRepo()
    const id = summaryRepo.insert({
      chat_id: data.chatId,
      chat_uuid: data.chatUuid,
      message_ids: JSON.stringify(data.messageIds),
      start_message_id: data.startMessageId,
      end_message_id: data.endMessageId,
      summary: data.summary,
      original_token_count: data.originalTokenCount ?? null,
      summary_token_count: data.summaryTokenCount ?? null,
      compression_ratio: data.compressionRatio ?? null,
      compressed_at: data.compressedAt,
      compression_model: data.compressionModel ?? null,
      compression_version: data.compressionVersion ?? 1,
      status: data.status ?? 'active'
    })
    console.log(`[DatabaseService] Saved compressed summary: ${id}`)
    return id
  }

  getCompressedSummariesByChatId(chatId: number): CompressedSummaryEntity[] {
    const summaryRepo = this.requireSummaryRepo()
    const rows = summaryRepo.getByChatId(chatId)
    return rows.map(row => this.rowToCompressedSummaryEntity(row))
  }

  getActiveCompressedSummariesByChatId(chatId: number): CompressedSummaryEntity[] {
    const summaryRepo = this.requireSummaryRepo()
    const rows = summaryRepo.getActiveByChatId(chatId)
    return rows.map(row => this.rowToCompressedSummaryEntity(row))
  }

  updateCompressedSummaryStatus(id: number, status: 'active' | 'superseded' | 'invalid'): void {
    const summaryRepo = this.requireSummaryRepo()
    summaryRepo.updateStatus(id, status)
    console.log(`[DatabaseService] Updated compressed summary status: ${id} -> ${status}`)
  }

  deleteCompressedSummary(id: number): void {
    const summaryRepo = this.requireSummaryRepo()
    summaryRepo.delete(id)
    console.log(`[DatabaseService] Deleted compressed summary: ${id}`)
  }

  private rowToCompressedSummaryEntity(row: CompressedSummaryRow): CompressedSummaryEntity {
    return {
      id: row.id,
      chatId: row.chat_id,
      chatUuid: row.chat_uuid,
      messageIds: JSON.parse(row.message_ids),
      startMessageId: row.start_message_id,
      endMessageId: row.end_message_id,
      summary: row.summary,
      originalTokenCount: row.original_token_count ?? undefined,
      summaryTokenCount: row.summary_token_count ?? undefined,
      compressionRatio: row.compression_ratio ?? undefined,
      compressedAt: row.compressed_at,
      compressionModel: row.compression_model ?? undefined,
      compressionVersion: row.compression_version ?? undefined,
      status: (row.status as 'active' | 'superseded' | 'invalid') ?? 'active'
    }
  }

  private requireSummaryRepo(): CompressedSummaryRepository {
    if (!this.deps.hasDb()) throw new Error('Database not initialized')
    const repo = this.deps.getSummaryRepo()
    if (!repo) throw new Error('Compressed summary repository not initialized')
    return repo
  }
}

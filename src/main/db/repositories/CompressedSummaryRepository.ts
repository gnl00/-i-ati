import type Database from 'better-sqlite3'

interface CompressedSummaryRow {
  id: number
  chat_id: number
  chat_uuid: string
  message_ids: string
  start_message_id: number
  end_message_id: number
  summary: string
  original_token_count: number | null
  summary_token_count: number | null
  compression_ratio: number | null
  compressed_at: number
  compression_model: string | null
  compression_version: number | null
  status: string
}

class CompressedSummaryRepository {
  private stmts: {
    insertCompressedSummary: Database.Statement
    getCompressedSummariesByChatId: Database.Statement
    getActiveCompressedSummariesByChatId: Database.Statement
    updateCompressedSummaryStatus: Database.Statement
    deleteCompressedSummary: Database.Statement
  }

  constructor(db: Database.Database) {
    this.stmts = {
      insertCompressedSummary: db.prepare(`
        INSERT INTO compressed_summaries (
          chat_id, chat_uuid, message_ids, start_message_id, end_message_id,
          summary, original_token_count, summary_token_count, compression_ratio,
          compressed_at, compression_model, compression_version, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      getCompressedSummariesByChatId: db.prepare(`
        SELECT * FROM compressed_summaries
        WHERE chat_id = ?
        ORDER BY start_message_id ASC
      `),
      getActiveCompressedSummariesByChatId: db.prepare(`
        SELECT * FROM compressed_summaries
        WHERE chat_id = ? AND status = 'active'
        ORDER BY start_message_id ASC
      `),
      updateCompressedSummaryStatus: db.prepare(`
        UPDATE compressed_summaries SET status = ? WHERE id = ?
      `),
      deleteCompressedSummary: db.prepare(`
        DELETE FROM compressed_summaries WHERE id = ?
      `)
    }
  }

  insert(row: Omit<CompressedSummaryRow, 'id'>): number {
    const result = this.stmts.insertCompressedSummary.run(
      row.chat_id,
      row.chat_uuid,
      row.message_ids,
      row.start_message_id,
      row.end_message_id,
      row.summary,
      row.original_token_count,
      row.summary_token_count,
      row.compression_ratio,
      row.compressed_at,
      row.compression_model,
      row.compression_version,
      row.status
    )
    return Number(result.lastInsertRowid)
  }

  getByChatId(chatId: number): CompressedSummaryRow[] {
    return this.stmts.getCompressedSummariesByChatId.all(chatId) as CompressedSummaryRow[]
  }

  getActiveByChatId(chatId: number): CompressedSummaryRow[] {
    return this.stmts.getActiveCompressedSummariesByChatId.all(chatId) as CompressedSummaryRow[]
  }

  updateStatus(id: number, status: string): void {
    this.stmts.updateCompressedSummaryStatus.run(status, id)
  }

  delete(id: number): void {
    this.stmts.deleteCompressedSummary.run(id)
  }
}

export { CompressedSummaryRepository }
export type { CompressedSummaryRow }

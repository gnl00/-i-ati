import type Database from 'better-sqlite3'

interface ChatSubmitEventRow {
  id?: number
  submission_id: string
  chat_id?: number | null
  chat_uuid?: string | null
  sequence: number
  type: string
  timestamp: number
  payload?: string | null
  meta?: string | null
}

class ChatSubmitEventRepository {
  private stmt: Database.Statement

  constructor(db: Database.Database) {
    this.stmt = db.prepare(`
      INSERT INTO chat_submit_events (
        submission_id, chat_id, chat_uuid, sequence, type, timestamp, payload, meta
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
  }

  insert(row: ChatSubmitEventRow): number {
    const result = this.stmt.run(
      row.submission_id,
      row.chat_id ?? null,
      row.chat_uuid ?? null,
      row.sequence,
      row.type,
      row.timestamp,
      row.payload ?? null,
      row.meta ?? null
    )
    return Number(result.lastInsertRowid)
  }
}

export { ChatSubmitEventRepository }
export type { ChatSubmitEventRow }

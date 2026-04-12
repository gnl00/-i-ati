import type Database from 'better-sqlite3'

interface WorkContextRow {
  chat_id: number
  chat_uuid: string
  content: string
  created_at: number
  updated_at: number
}

class WorkContextDao {
  private stmts: {
    upsert: Database.Statement
    getByChatId: Database.Statement
    getByChatUuid: Database.Statement
    deleteByChatId: Database.Statement
  }

  constructor(db: Database.Database) {
    this.stmts = {
      upsert: db.prepare(`
        INSERT INTO work_contexts (
          chat_id, chat_uuid, content, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(chat_id) DO UPDATE SET
          chat_uuid = excluded.chat_uuid,
          content = excluded.content,
          updated_at = excluded.updated_at
      `),
      getByChatId: db.prepare(`
        SELECT * FROM work_contexts WHERE chat_id = ?
      `),
      getByChatUuid: db.prepare(`
        SELECT * FROM work_contexts WHERE chat_uuid = ?
      `),
      deleteByChatId: db.prepare(`
        DELETE FROM work_contexts WHERE chat_id = ?
      `)
    }
  }

  upsert(row: WorkContextRow): void {
    this.stmts.upsert.run(
      row.chat_id,
      row.chat_uuid,
      row.content,
      row.created_at,
      row.updated_at
    )
  }

  getByChatId(chatId: number): WorkContextRow | undefined {
    return this.stmts.getByChatId.get(chatId) as WorkContextRow | undefined
  }

  getByChatUuid(chatUuid: string): WorkContextRow | undefined {
    return this.stmts.getByChatUuid.get(chatUuid) as WorkContextRow | undefined
  }

  deleteByChatId(chatId: number): void {
    this.stmts.deleteByChatId.run(chatId)
  }
}

export { WorkContextDao }
export type { WorkContextRow }

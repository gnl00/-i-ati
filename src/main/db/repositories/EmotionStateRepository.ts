import type Database from 'better-sqlite3'

interface EmotionStateRow {
  chat_id: number
  chat_uuid: string
  state_json: string
  created_at: number
  updated_at: number
}

class EmotionStateRepository {
  private stmts: {
    upsert: Database.Statement
    getByChatId: Database.Statement
    getByChatUuid: Database.Statement
    deleteByChatId: Database.Statement
  }

  constructor(db: Database.Database) {
    this.stmts = {
      upsert: db.prepare(`
        INSERT INTO emotion_states (
          chat_id, chat_uuid, state_json, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(chat_id) DO UPDATE SET
          chat_uuid = excluded.chat_uuid,
          state_json = excluded.state_json,
          updated_at = excluded.updated_at
      `),
      getByChatId: db.prepare(`
        SELECT * FROM emotion_states WHERE chat_id = ?
      `),
      getByChatUuid: db.prepare(`
        SELECT * FROM emotion_states WHERE chat_uuid = ?
      `),
      deleteByChatId: db.prepare(`
        DELETE FROM emotion_states WHERE chat_id = ?
      `)
    }
  }

  upsert(row: EmotionStateRow): void {
    this.stmts.upsert.run(
      row.chat_id,
      row.chat_uuid,
      row.state_json,
      row.created_at,
      row.updated_at
    )
  }

  getByChatId(chatId: number): EmotionStateRow | undefined {
    return this.stmts.getByChatId.get(chatId) as EmotionStateRow | undefined
  }

  getByChatUuid(chatUuid: string): EmotionStateRow | undefined {
    return this.stmts.getByChatUuid.get(chatUuid) as EmotionStateRow | undefined
  }

  deleteByChatId(chatId: number): void {
    this.stmts.deleteByChatId.run(chatId)
  }
}

export { EmotionStateRepository }
export type { EmotionStateRow }

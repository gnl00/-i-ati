import type Database from 'better-sqlite3'

interface EmotionStateRow {
  scope: 'app'
  state_json: string
  created_at: number
  updated_at: number
}

class EmotionStateDao {
  private stmts: {
    upsert: Database.Statement
    get: Database.Statement
    delete: Database.Statement
  }

  constructor(private readonly db: Database.Database) {
    this.stmts = {
      upsert: this.db.prepare(`
        INSERT INTO app_emotion_state (
          scope, state_json, created_at, updated_at
        )
        VALUES (?, ?, ?, ?)
        ON CONFLICT(scope) DO UPDATE SET
          state_json = excluded.state_json,
          updated_at = excluded.updated_at
      `),
      get: this.db.prepare(`SELECT * FROM app_emotion_state WHERE scope = 'app'`),
      delete: this.db.prepare(`DELETE FROM app_emotion_state WHERE scope = 'app'`)
    }
  }

  upsert(row: EmotionStateRow): void {
    this.stmts.upsert.run(
      row.scope,
      row.state_json,
      row.created_at,
      row.updated_at
    )
  }

  get(): EmotionStateRow | undefined {
    return this.stmts.get.get() as EmotionStateRow | undefined
  }

  delete(): void {
    this.stmts.delete.run()
  }

  transaction<T>(operation: () => T): T {
    return this.db.transaction(operation)()
  }
}

export { EmotionStateDao }
export type { EmotionStateRow }

import type Database from 'better-sqlite3'

interface ConfigRow {
  key: string
  value: string
  version: number | null
  updated_at: number
}

class ConfigRepository {
  private stmts: {
    getConfig: Database.Statement
    upsertConfig: Database.Statement
  }

  constructor(db: Database.Database) {
    this.stmts = {
      getConfig: db.prepare(`SELECT * FROM configs WHERE key = ?`),
      upsertConfig: db.prepare(`
        INSERT INTO configs (key, value, version, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          version = excluded.version,
          updated_at = excluded.updated_at
      `)
    }
  }

  getConfig(): ConfigRow | undefined {
    return this.stmts.getConfig.get('appConfig') as ConfigRow | undefined
  }

  saveConfig(value: string, version: number | null): void {
    this.stmts.upsertConfig.run('appConfig', value, version, Date.now())
  }

  getValue(key: string): string | undefined {
    const row = this.stmts.getConfig.get(key) as ConfigRow | undefined
    return row?.value
  }

  saveValue(key: string, value: string, version?: number | null): void {
    this.stmts.upsertConfig.run(key, value, version ?? null, Date.now())
  }
}

export { ConfigRepository }
export type { ConfigRow }

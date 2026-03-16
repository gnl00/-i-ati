import type Database from 'better-sqlite3'

interface McpServerRow {
  name: string
  config_json: string
  created_at: number
  updated_at: number
}

class McpServerRepository {
  private stmts: {
    getAll: Database.Statement
    countAll: Database.Statement
    upsert: Database.Statement
    deleteByName: Database.Statement
    clearAll: Database.Statement
  }

  constructor(db: Database.Database) {
    this.stmts = {
      getAll: db.prepare(`
        SELECT * FROM mcp_servers
        ORDER BY created_at ASC, name ASC
      `),
      countAll: db.prepare(`
        SELECT COUNT(*) as count FROM mcp_servers
      `),
      upsert: db.prepare(`
        INSERT INTO mcp_servers (name, config_json, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET
          config_json = excluded.config_json,
          updated_at = excluded.updated_at
      `),
      deleteByName: db.prepare(`
        DELETE FROM mcp_servers WHERE name = ?
      `),
      clearAll: db.prepare(`
        DELETE FROM mcp_servers
      `)
    }
  }

  getAll(): McpServerRow[] {
    return this.stmts.getAll.all() as McpServerRow[]
  }

  countAll(): number {
    const row = this.stmts.countAll.get() as { count: number }
    return row?.count ?? 0
  }

  upsert(row: McpServerRow): void {
    this.stmts.upsert.run(
      row.name,
      row.config_json,
      row.created_at,
      row.updated_at
    )
  }

  deleteByName(name: string): void {
    this.stmts.deleteByName.run(name)
  }

  clearAll(): void {
    this.stmts.clearAll.run()
  }
}

export { McpServerRepository }
export type { McpServerRow }

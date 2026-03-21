import type Database from 'better-sqlite3'

interface PluginRow {
  plugin_id: string
  source: 'built-in' | 'local' | 'remote'
  display_name: string
  description: string | null
  enabled: number
  version: string | null
  manifest_path: string | null
  install_root: string | null
  status: PluginStatus
  last_error: string | null
  created_at: number
  updated_at: number
}

class PluginRepository {
  private stmts: {
    getAll: Database.Statement
    countAll: Database.Statement
    upsert: Database.Statement
    deleteById: Database.Statement
    clearAll: Database.Statement
  }

  constructor(db: Database.Database) {
    this.stmts = {
      getAll: db.prepare(`
        SELECT * FROM plugins
        ORDER BY source ASC, created_at ASC, plugin_id ASC
      `),
      countAll: db.prepare(`
        SELECT COUNT(*) as count FROM plugins
      `),
      upsert: db.prepare(`
        INSERT INTO plugins (
          plugin_id,
          source,
          display_name,
          description,
          enabled,
          version,
          manifest_path,
          install_root,
          status,
          last_error,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(plugin_id) DO UPDATE SET
          source = excluded.source,
          display_name = excluded.display_name,
          description = excluded.description,
          enabled = excluded.enabled,
          version = excluded.version,
          manifest_path = excluded.manifest_path,
          install_root = excluded.install_root,
          status = excluded.status,
          last_error = excluded.last_error,
          updated_at = excluded.updated_at
      `),
      deleteById: db.prepare(`
        DELETE FROM plugins WHERE plugin_id = ?
      `),
      clearAll: db.prepare(`
        DELETE FROM plugins
      `)
    }
  }

  getAll(): PluginRow[] {
    return this.stmts.getAll.all() as PluginRow[]
  }

  countAll(): number {
    const row = this.stmts.countAll.get() as { count: number }
    return row?.count ?? 0
  }

  upsert(row: PluginRow): void {
    this.stmts.upsert.run(
      row.plugin_id,
      row.source,
      row.display_name,
      row.description,
      row.enabled,
      row.version,
      row.manifest_path,
      row.install_root,
      row.status,
      row.last_error,
      row.created_at,
      row.updated_at
    )
  }

  deleteById(pluginId: string): void {
    this.stmts.deleteById.run(pluginId)
  }

  clearAll(): void {
    this.stmts.clearAll.run()
  }
}

export { PluginRepository }
export type { PluginRow }

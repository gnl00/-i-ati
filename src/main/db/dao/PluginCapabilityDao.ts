import type Database from 'better-sqlite3'

interface PluginCapabilityRow {
  id?: number
  plugin_id: string
  capability_kind: string
  capability_json: string
  created_at: number
  updated_at: number
}

class PluginCapabilityDao {
  private stmts: {
    getAll: Database.Statement
    getByPluginId: Database.Statement
    insert: Database.Statement
    deleteByPluginId: Database.Statement
  }

  constructor(db: Database.Database) {
    this.stmts = {
      getAll: db.prepare(`
        SELECT * FROM plugin_capabilities
        ORDER BY plugin_id ASC, capability_kind ASC, id ASC
      `),
      getByPluginId: db.prepare(`
        SELECT * FROM plugin_capabilities
        WHERE plugin_id = ?
        ORDER BY capability_kind ASC, id ASC
      `),
      insert: db.prepare(`
        INSERT INTO plugin_capabilities (
          plugin_id,
          capability_kind,
          capability_json,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?)
      `),
      deleteByPluginId: db.prepare(`
        DELETE FROM plugin_capabilities WHERE plugin_id = ?
      `)
    }
  }

  getAll(): PluginCapabilityRow[] {
    return this.stmts.getAll.all() as PluginCapabilityRow[]
  }

  getByPluginId(pluginId: string): PluginCapabilityRow[] {
    return this.stmts.getByPluginId.all(pluginId) as PluginCapabilityRow[]
  }

  insert(row: PluginCapabilityRow): void {
    this.stmts.insert.run(
      row.plugin_id,
      row.capability_kind,
      row.capability_json,
      row.created_at,
      row.updated_at
    )
  }

  replaceByPluginId(pluginId: string, rows: PluginCapabilityRow[]): void {
    this.deleteByPluginId(pluginId)
    rows.forEach(row => this.insert(row))
  }

  deleteByPluginId(pluginId: string): void {
    this.stmts.deleteByPluginId.run(pluginId)
  }
}

export { PluginCapabilityDao }
export type { PluginCapabilityRow }

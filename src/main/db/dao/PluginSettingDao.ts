import type Database from 'better-sqlite3'

interface PluginSettingRow {
  plugin_id: string
  key: string
  value_json: string
  updated_at: number
}

class PluginSettingDao {
  private stmts: {
    getByPluginId: Database.Statement
    upsert: Database.Statement
    deleteByPluginId: Database.Statement
    deleteByPluginIdAndKey: Database.Statement
  }

  constructor(db: Database.Database) {
    this.stmts = {
      getByPluginId: db.prepare(`
        SELECT * FROM plugin_settings
        WHERE plugin_id = ?
        ORDER BY key ASC
      `),
      upsert: db.prepare(`
        INSERT INTO plugin_settings (plugin_id, key, value_json, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(plugin_id, key) DO UPDATE SET
          value_json = excluded.value_json,
          updated_at = excluded.updated_at
      `),
      deleteByPluginId: db.prepare(`
        DELETE FROM plugin_settings WHERE plugin_id = ?
      `),
      deleteByPluginIdAndKey: db.prepare(`
        DELETE FROM plugin_settings WHERE plugin_id = ? AND key = ?
      `)
    }
  }

  getByPluginId(pluginId: string): PluginSettingRow[] {
    return this.stmts.getByPluginId.all(pluginId) as PluginSettingRow[]
  }

  upsert(row: PluginSettingRow): void {
    this.stmts.upsert.run(
      row.plugin_id,
      row.key,
      row.value_json,
      row.updated_at
    )
  }

  deleteByPluginId(pluginId: string): void {
    this.stmts.deleteByPluginId.run(pluginId)
  }

  deleteByPluginIdAndKey(pluginId: string, key: string): void {
    this.stmts.deleteByPluginIdAndKey.run(pluginId, key)
  }
}

export { PluginSettingDao }
export type { PluginSettingRow }

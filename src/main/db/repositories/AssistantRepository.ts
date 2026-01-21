import type Database from 'better-sqlite3'

interface AssistantRow {
  id: string
  name: string
  icon: string | null
  description: string | null
  model_account_id: string
  model_model_id: string
  system_prompt: string
  created_at: number
  updated_at: number
  is_built_in: number
  is_default: number
}

class AssistantRepository {
  private stmts: {
    insertAssistant: Database.Statement
    getAllAssistants: Database.Statement
    getAssistantById: Database.Statement
    updateAssistant: Database.Statement
    deleteAssistant: Database.Statement
    deleteAllAssistants: Database.Statement
  }

  constructor(db: Database.Database) {
    this.stmts = {
      insertAssistant: db.prepare(`
        INSERT INTO assistants (
          id, name, icon, description, model_account_id, model_model_id,
          system_prompt, created_at, updated_at, is_built_in, is_default
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      getAllAssistants: db.prepare(`
        SELECT * FROM assistants ORDER BY updated_at DESC
      `),
      getAssistantById: db.prepare(`
        SELECT * FROM assistants WHERE id = ?
      `),
      updateAssistant: db.prepare(`
        UPDATE assistants SET
          name = ?, icon = ?, description = ?, model_account_id = ?, model_model_id = ?,
          system_prompt = ?, updated_at = ?, is_built_in = ?, is_default = ?
        WHERE id = ?
      `),
      deleteAssistant: db.prepare(`
        DELETE FROM assistants WHERE id = ?
      `),
      deleteAllAssistants: db.prepare(`DELETE FROM assistants`)
    }
  }

  insert(row: AssistantRow): void {
    this.stmts.insertAssistant.run(
      row.id,
      row.name,
      row.icon,
      row.description,
      row.model_account_id,
      row.model_model_id,
      row.system_prompt,
      row.created_at,
      row.updated_at,
      row.is_built_in,
      row.is_default
    )
  }

  getAll(): AssistantRow[] {
    return this.stmts.getAllAssistants.all() as AssistantRow[]
  }

  getById(id: string): AssistantRow | undefined {
    return this.stmts.getAssistantById.get(id) as AssistantRow | undefined
  }

  update(row: AssistantRow): void {
    this.stmts.updateAssistant.run(
      row.name,
      row.icon,
      row.description,
      row.model_account_id,
      row.model_model_id,
      row.system_prompt,
      row.updated_at,
      row.is_built_in,
      row.is_default,
      row.id
    )
  }

  delete(id: string): void {
    this.stmts.deleteAssistant.run(id)
  }

  deleteAll(): void {
    this.stmts.deleteAllAssistants.run()
  }
}

export { AssistantRepository }
export type { AssistantRow }

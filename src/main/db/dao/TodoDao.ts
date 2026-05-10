import type Database from 'better-sqlite3'
import type { TodoPriority, TodoStatus } from '@shared/tools/todo'

export interface TodoRow {
  id: string
  chat_uuid: string | null
  title: string
  notes: string | null
  status: TodoStatus
  priority: TodoPriority | null
  tags_json: string | null
  created_at: number
  updated_at: number
  completed_at: number | null
  deleted_at: number | null
}

export interface TodoListFilters {
  chatUuid?: string
  status?: TodoStatus
  tag?: string
  priority?: TodoPriority
  limit: number
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&')
}

class TodoDao {
  private stmts: {
    insertTodo: Database.Statement
    updateTodo: Database.Statement
    getById: Database.Statement
    deleteById: Database.Statement
  }

  constructor(private readonly db: Database.Database) {
    this.stmts = {
      insertTodo: this.db.prepare(`
        INSERT INTO todos (
          id, chat_uuid, title, notes, status, priority, tags_json,
          created_at, updated_at, completed_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      updateTodo: this.db.prepare(`
        UPDATE todos SET
          chat_uuid = ?,
          title = ?,
          notes = ?,
          status = ?,
          priority = ?,
          tags_json = ?,
          updated_at = ?,
          completed_at = ?,
          deleted_at = ?
        WHERE id = ?
      `),
      getById: this.db.prepare(`
        SELECT * FROM todos WHERE id = ?
      `),
      deleteById: this.db.prepare(`
        UPDATE todos SET deleted_at = ?, updated_at = ? WHERE id = ?
      `)
    }
  }

  insertTodo(row: TodoRow): void {
    this.stmts.insertTodo.run(
      row.id,
      row.chat_uuid,
      row.title,
      row.notes,
      row.status,
      row.priority,
      row.tags_json,
      row.created_at,
      row.updated_at,
      row.completed_at,
      row.deleted_at
    )
  }

  updateTodo(row: TodoRow): void {
    this.stmts.updateTodo.run(
      row.chat_uuid,
      row.title,
      row.notes,
      row.status,
      row.priority,
      row.tags_json,
      row.updated_at,
      row.completed_at,
      row.deleted_at,
      row.id
    )
  }

  getById(id: string): TodoRow | undefined {
    return this.stmts.getById.get(id) as TodoRow | undefined
  }

  list(filters: TodoListFilters): TodoRow[] {
    const where: string[] = ['deleted_at IS NULL']
    const params: Array<string | number> = []

    if (filters.chatUuid) {
      where.push('chat_uuid = ?')
      params.push(filters.chatUuid)
    }

    if (filters.status) {
      where.push('status = ?')
      params.push(filters.status)
    }

    if (filters.tag) {
      where.push("tags_json LIKE ? ESCAPE '\\'")
      params.push(`%${escapeLikePattern(JSON.stringify(filters.tag))}%`)
    }

    if (filters.priority) {
      where.push('priority = ?')
      params.push(filters.priority)
    }

    params.push(filters.limit)

    const sql = `
      SELECT * FROM todos
      WHERE ${where.join(' AND ')}
      ORDER BY updated_at DESC
      LIMIT ?
    `

    return this.db.prepare(sql).all(...params) as TodoRow[]
  }

  softDeleteById(id: string, deletedAt: number): void {
    this.stmts.deleteById.run(deletedAt, deletedAt, id)
  }
}

export { TodoDao }

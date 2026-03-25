import type Database from 'better-sqlite3'

interface ChatHostBindingRow {
  id: number
  host_type: string
  host_chat_id: string
  host_thread_id: string | null
  host_user_id: string | null
  chat_id: number
  chat_uuid: string
  last_host_message_id: string | null
  status: 'active' | 'archived'
  metadata_json: string | null
  created_at: number
  updated_at: number
}

class ChatHostBindingRepository {
  private readonly stmts: {
    insertBinding: Database.Statement
    getBindingByHost: Database.Statement
    getBindingsByChatUuid: Database.Statement
    updateBindingById: Database.Statement
    updateLastHostMessageId: Database.Statement
    updateStatus: Database.Statement
  }

  constructor(db: Database.Database) {
    this.stmts = {
      insertBinding: db.prepare(`
        INSERT INTO chat_host_bindings (
          host_type, host_chat_id, host_thread_id, host_user_id,
          chat_id, chat_uuid, last_host_message_id, status, metadata_json, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      getBindingByHost: db.prepare(`
        SELECT * FROM chat_host_bindings
        WHERE host_type = ? AND host_chat_id = ? AND (
          (host_thread_id IS NULL AND ? IS NULL) OR host_thread_id = ?
        )
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
      `),
      getBindingsByChatUuid: db.prepare(`
        SELECT * FROM chat_host_bindings WHERE chat_uuid = ? ORDER BY updated_at DESC
      `),
      updateBindingById: db.prepare(`
        UPDATE chat_host_bindings
        SET
          host_user_id = ?,
          chat_id = ?,
          chat_uuid = ?,
          last_host_message_id = ?,
          status = ?,
          metadata_json = ?,
          updated_at = ?
        WHERE id = ?
      `),
      updateLastHostMessageId: db.prepare(`
        UPDATE chat_host_bindings
        SET last_host_message_id = ?, updated_at = ?
        WHERE id = ?
      `),
      updateStatus: db.prepare(`
        UPDATE chat_host_bindings
        SET status = ?, updated_at = ?
        WHERE id = ?
      `)
    }
  }

  insertBinding(row: ChatHostBindingRow): number {
    const result = this.stmts.insertBinding.run(
      row.host_type,
      row.host_chat_id,
      row.host_thread_id,
      row.host_user_id,
      row.chat_id,
      row.chat_uuid,
      row.last_host_message_id,
      row.status,
      row.metadata_json,
      row.created_at,
      row.updated_at
    )
    return Number(result.lastInsertRowid)
  }

  updateBindingById(id: number, row: ChatHostBindingRow): void {
    this.stmts.updateBindingById.run(
      row.host_user_id,
      row.chat_id,
      row.chat_uuid,
      row.last_host_message_id,
      row.status,
      row.metadata_json,
      row.updated_at,
      id
    )
  }

  getBindingByHost(
    hostType: string,
    hostChatId: string,
    hostThreadId?: string
  ): ChatHostBindingRow | undefined {
    return this.stmts.getBindingByHost.get(
      hostType,
      hostChatId,
      hostThreadId ?? null,
      hostThreadId ?? null
    ) as ChatHostBindingRow | undefined
  }

  getBindingsByChatUuid(chatUuid: string): ChatHostBindingRow[] {
    return this.stmts.getBindingsByChatUuid.all(chatUuid) as ChatHostBindingRow[]
  }

  updateLastHostMessageId(id: number, lastHostMessageId: string | null, updatedAt: number): void {
    this.stmts.updateLastHostMessageId.run(lastHostMessageId, updatedAt, id)
  }

  updateStatus(id: number, status: 'active' | 'archived', updatedAt: number): void {
    this.stmts.updateStatus.run(status, updatedAt, id)
  }
}

export { ChatHostBindingRepository }
export type { ChatHostBindingRow }

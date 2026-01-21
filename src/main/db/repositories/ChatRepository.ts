import type Database from 'better-sqlite3'

interface ChatRow {
  id: number
  uuid: string
  title: string
  msg_count: number
  model: string | null
  workspace_path: string | null
  create_time: number
  update_time: number
}

class ChatRepository {
  private stmts: {
    insertChat: Database.Statement
    getAllChats: Database.Statement
    getChatById: Database.Statement
    getChatByUuid: Database.Statement
    getWorkspacePathByUuid: Database.Statement
    updateChat: Database.Statement
    deleteChat: Database.Statement
  }

  constructor(db: Database.Database) {
    this.stmts = {
      insertChat: db.prepare(`
        INSERT INTO chats (uuid, title, model, workspace_path, create_time, update_time)
        VALUES (?, ?, ?, ?, ?, ?)
      `),
      getAllChats: db.prepare(`
        SELECT * FROM chats ORDER BY update_time DESC
      `),
      getChatById: db.prepare(`
        SELECT * FROM chats WHERE id = ?
      `),
      getChatByUuid: db.prepare(`
        SELECT * FROM chats WHERE uuid = ?
      `),
      getWorkspacePathByUuid: db.prepare(`
        SELECT workspace_path FROM chats WHERE uuid = ?
      `),
      updateChat: db.prepare(`
        UPDATE chats SET uuid = ?, title = ?, model = ?, workspace_path = ?, create_time = ?, update_time = ?
        WHERE id = ?
      `),
      deleteChat: db.prepare(`
        DELETE FROM chats WHERE id = ?
      `)
    }
  }

  insertChat(row: ChatRow): number {
    const result = this.stmts.insertChat.run(
      row.uuid,
      row.title,
      row.model,
      row.workspace_path,
      row.create_time,
      row.update_time
    )
    return Number(result.lastInsertRowid)
  }

  getAllChats(): ChatRow[] {
    return this.stmts.getAllChats.all() as ChatRow[]
  }

  getChatById(id: number): ChatRow | undefined {
    return this.stmts.getChatById.get(id) as ChatRow | undefined
  }

  getChatByUuid(uuid: string): ChatRow | undefined {
    return this.stmts.getChatByUuid.get(uuid) as ChatRow | undefined
  }

  getWorkspacePathByUuid(uuid: string): string | undefined {
    const row = this.stmts.getWorkspacePathByUuid.get(uuid) as { workspace_path: string | null } | undefined
    return row?.workspace_path ?? undefined
  }

  updateChat(row: ChatRow): void {
    this.stmts.updateChat.run(
      row.uuid,
      row.title,
      row.model,
      row.workspace_path,
      row.create_time,
      row.update_time,
      row.id
    )
  }

  deleteChat(id: number): void {
    this.stmts.deleteChat.run(id)
  }
}

export { ChatRepository }
export type { ChatRow }

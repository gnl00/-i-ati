import type Database from 'better-sqlite3'

interface MessageRow {
  id: number
  chat_id: number | null
  chat_uuid: string | null
  body: string
  tokens: number | null
}

type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

class MessageRepository {
  private db: Database.Database
  private stmts: {
    insertMessage: Database.Statement
    getAllMessages: Database.Statement
    getMessageById: Database.Statement
    getMessagesByChatId: Database.Statement
    getMessagesByChatUuid: Database.Statement
    updateMessage: Database.Statement
    deleteMessage: Database.Statement
  }

  constructor(db: Database.Database) {
    this.db = db
    this.stmts = {
      insertMessage: db.prepare(`
        INSERT INTO messages (chat_id, chat_uuid, body, tokens)
        VALUES (?, ?, ?, ?)
      `),
      getAllMessages: db.prepare(`
        SELECT * FROM messages
      `),
      getMessageById: db.prepare(`
        SELECT * FROM messages WHERE id = ?
      `),
      getMessagesByChatId: db.prepare(`
        SELECT * FROM messages WHERE chat_id = ? ORDER BY id ASC
      `),
      getMessagesByChatUuid: db.prepare(`
        SELECT * FROM messages WHERE chat_uuid = ? ORDER BY id ASC
      `),
      updateMessage: db.prepare(`
        UPDATE messages SET chat_id = ?, chat_uuid = ?, body = ?, tokens = ?
        WHERE id = ?
      `),
      deleteMessage: db.prepare(`
        DELETE FROM messages WHERE id = ?
      `)
    }
  }

  private shouldCountForChat(bodyJson: string | null | undefined): boolean {
    if (!bodyJson) return false
    try {
      const parsed = JSON.parse(bodyJson) as { role?: ChatRole }
      return parsed?.role === 'user' || parsed?.role === 'assistant'
    } catch {
      return false
    }
  }

  insertMessage(row: Omit<MessageRow, 'id'>): number {
    const result = this.stmts.insertMessage.run(row.chat_id, row.chat_uuid, row.body, row.tokens)
    if (row.chat_id && this.shouldCountForChat(row.body)) {
      this.db.prepare('UPDATE chats SET msg_count = msg_count + 1 WHERE id = ?').run(row.chat_id)
    }
    return Number(result.lastInsertRowid)
  }

  getAllMessages(): MessageRow[] {
    return this.stmts.getAllMessages.all() as MessageRow[]
  }

  getMessageById(id: number): MessageRow | undefined {
    return this.stmts.getMessageById.get(id) as MessageRow | undefined
  }

  getMessagesByChatId(chatId: number): MessageRow[] {
    return this.stmts.getMessagesByChatId.all(chatId) as MessageRow[]
  }

  getMessagesByChatUuid(chatUuid: string): MessageRow[] {
    return this.stmts.getMessagesByChatUuid.all(chatUuid) as MessageRow[]
  }

  getMessageByIds(ids: number[]): MessageRow[] {
    if (!ids.length) return []
    const placeholders = ids.map(() => '?').join(',')
    return this.db.prepare(`SELECT * FROM messages WHERE id IN (${placeholders})`).all(...ids) as MessageRow[]
  }

  updateMessage(row: MessageRow): void {
    const prev = this.db.prepare('SELECT chat_id, body FROM messages WHERE id = ?').get(row.id) as { chat_id: number | null; body?: string } | undefined
    this.stmts.updateMessage.run(row.chat_id, row.chat_uuid, row.body, row.tokens, row.id)
    if (!prev) return

    const prevCounted = this.shouldCountForChat(prev.body)
    const nextCounted = this.shouldCountForChat(row.body)

    if (prev.chat_id === row.chat_id) {
      if (!row.chat_id) return
      if (prevCounted === nextCounted) return
      const delta = nextCounted ? 1 : -1
      this.db.prepare('UPDATE chats SET msg_count = msg_count + ? WHERE id = ?').run(delta, row.chat_id)
      return
    }

    if (prev.chat_id && prevCounted) {
      this.db.prepare('UPDATE chats SET msg_count = msg_count - 1 WHERE id = ?').run(prev.chat_id)
    }
    if (row.chat_id && nextCounted) {
      this.db.prepare('UPDATE chats SET msg_count = msg_count + 1 WHERE id = ?').run(row.chat_id)
    }
  }

  deleteMessage(id: number): void {
    const message = this.db.prepare('SELECT chat_id, body FROM messages WHERE id = ?').get(id) as { chat_id: number | null; body?: string } | undefined
    this.stmts.deleteMessage.run(id)
    if (message?.chat_id && this.shouldCountForChat(message.body)) {
      this.db.prepare('UPDATE chats SET msg_count = msg_count - 1 WHERE id = ?').run(message.chat_id)
    }
  }
}

export { MessageRepository }
export type { MessageRow }

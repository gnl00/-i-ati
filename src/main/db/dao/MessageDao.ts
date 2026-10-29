import type Database from 'better-sqlite3'

interface MessageRow {
  id: number
  revision: number
  chat_id: number | null
  chat_uuid: string | null
  body: string
  tokens: number | null
  token_usage: string | null
}

class MessageDao {
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
        INSERT INTO messages (chat_id, chat_uuid, body, tokens, token_usage)
        VALUES (?, ?, ?, ?, ?)
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
        UPDATE messages SET chat_id = ?, chat_uuid = ?, body = ?, tokens = ?, token_usage = ?, revision = ?
        WHERE id = ?
      `),
      deleteMessage: db.prepare(`
        DELETE FROM messages WHERE id = ?
      `)
    }
  }

  insertMessage(row: Omit<MessageRow, 'id'>): number {
    const result = this.stmts.insertMessage.run(
      row.chat_id,
      row.chat_uuid,
      row.body,
      row.tokens,
      row.token_usage
    )
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

  getContextHistory(chatUuid: string, coverage?: {
    messageIds: number[]; startMessageId: number; endMessageId: number
  }): { rows: MessageRow[]; summaryApplied: boolean } {
    if (coverage?.messageIds.length) {
      const { messageIds, startMessageId, endMessageId } = coverage
      const ids = new Set(messageIds)
      const validIds = ids.size === messageIds.length && ids.has(startMessageId) && ids.has(endMessageId)
        && messageIds.every(id => Number.isSafeInteger(id) && id >= startMessageId && id <= endMessageId)
      if (validIds) {
        // Validate coverage using IDs only; covered message bodies stay in SQLite.
        const prefix = this.db.prepare(`SELECT COUNT(*) AS count, MIN(id) AS firstId, MAX(id) AS lastId
          FROM messages WHERE chat_uuid = ? AND id <= ?`).get(chatUuid, endMessageId) as {
            count: number; firstId: number | null; lastId: number | null
          }
        const owned = this.db.prepare(`SELECT COUNT(*) AS count FROM messages
          WHERE chat_uuid = ? AND id IN (SELECT value FROM json_each(?))`)
          .get(chatUuid, JSON.stringify(messageIds)) as { count: number }
        if (prefix.count === ids.size && owned.count === ids.size
          && prefix.firstId === startMessageId && prefix.lastId === endMessageId) {
          const rows = this.db.prepare(`SELECT * FROM messages WHERE chat_uuid = ? AND id > ? ORDER BY id ASC`)
            .all(chatUuid, endMessageId) as MessageRow[]
          return { rows, summaryApplied: true }
        }
      }
    }
    return { rows: this.getMessagesByChatUuid(chatUuid), summaryApplied: false }
  }

  getMessageByIds(ids: number[]): MessageRow[] {
    if (!ids.length) return []
    const placeholders = ids.map(() => '?').join(',')
    return this.db.prepare(`SELECT * FROM messages WHERE id IN (${placeholders})`).all(...ids) as MessageRow[]
  }

  updateMessage(row: MessageRow): void {
    this.stmts.updateMessage.run(
      row.chat_id,
      row.chat_uuid,
      row.body,
      row.tokens,
      row.token_usage,
      row.revision,
      row.id
    )
  }

  deleteMessage(id: number): void {
    this.stmts.deleteMessage.run(id)
  }
}

export { MessageDao }
export type { MessageRow }

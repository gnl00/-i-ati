import type Database from 'better-sqlite3'
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'
import { ChatHostBindingDao } from '../ChatHostBindingDao'
import { AppDatabase } from '../../core/Database'

vi.mock('electron', () => ({ app: { getPath: (): string => '/tmp/ati-telegram-db-test' } }))
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => Pick<Database.Database, 'exec' | 'close' | 'prepare'>
}

// Execute the production schema against real SQLite without Electron's addon ABI.
const createDatabase = (): InstanceType<typeof DatabaseSync> => {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  const schema = AppDatabase.getInstance() as unknown as { db: typeof db; createTables(): void; createIndexes(): void }
  schema.db = db
  schema.createTables()
  schema.createIndexes()
  return db
}

const target = (id: number, uuid: string): ChatTelegramTargetEntity => ({
  chatId: id, chatUuid: uuid, botId: 'bot', hostChatId: 'peer', hostThreadId: 'topic'
})

describe('Telegram delivery persistence', () => {
  it('shares a destination across source chats, survives DAO recreation, and leaves inbound bindings unchanged', () => {
    const db = createDatabase()
    try {
      db.exec("INSERT INTO chats (id, uuid, title, create_time, update_time) VALUES (1, 'gold', 'Gold', 1, 1), (2, 'medicine', 'Medicine', 1, 1)")
      const dao = new ChatHostBindingDao(db as unknown as Database.Database)
      dao.insertBinding({ id: 0, host_type: 'telegram', host_chat_id: 'peer', host_thread_id: 'topic', host_user_id: null,
        chat_id: 1, chat_uuid: 'gold', last_host_message_id: null, status: 'active', metadata_json: null, created_at: 1, updated_at: 1 })
      dao.saveTelegramTarget(target(1, 'gold'))
      dao.saveTelegramTarget(target(2, 'medicine'))
      const reloaded = new ChatHostBindingDao(db as unknown as Database.Database)
      expect(reloaded.getTelegramTarget('gold', 'bot')).toEqual(target(1, 'gold'))
      expect(reloaded.getTelegramTarget('medicine', 'bot')).toEqual(target(2, 'medicine'))
      expect(reloaded.getTelegramTarget('medicine', 'other-bot')).toBeUndefined()
      expect(reloaded.getBindingByHost('telegram', 'peer', 'topic')?.chat_uuid).toBe('gold')
      dao.saveTelegramTarget({ ...target(2, 'medicine'), hostChatId: 'new-peer' })
      expect(dao.getTelegramTarget('medicine', 'bot')?.hostChatId).toBe('new-peer')
      db.exec('DELETE FROM chats WHERE id = 2')
      expect(dao.getTelegramTarget('medicine', 'bot')).toBeUndefined()
    } finally { db.close() }
  })

  it('scopes reply receipts by bot, peer, topic and message, and cascades source deletion', () => {
    const db = createDatabase()
    try {
      db.exec("INSERT INTO chats (id, uuid, title, create_time, update_time) VALUES (1, 'gold', 'Gold', 1, 1), (2, 'medicine', 'Medicine', 1, 1)")
      db.exec(`INSERT INTO messages (id, chat_id, chat_uuid, body) VALUES (10, 1, 'gold', '{}'), (20, 2, 'medicine', '{}')`)
      const dao = new ChatHostBindingDao(db as unknown as Database.Database)
      dao.saveTelegramReceipt(target(1, 'gold'), '100', 10)
      dao.saveTelegramReceipt(target(2, 'medicine'), '200', 20)
      expect(dao.getTelegramReplyChat('bot', 'peer', '100', 'topic')).toBe('gold')
      expect(dao.getTelegramReplyChat('bot', 'peer', '200', 'topic')).toBe('medicine')
      expect(dao.getTelegramReplyChat('other-bot', 'peer', '200', 'topic')).toBeUndefined()
      expect(dao.getTelegramReplyChat('bot', 'other-peer', '200', 'topic')).toBeUndefined()
      expect(dao.getTelegramReplyChat('bot', 'peer', '200')).toBeUndefined()
      expect(dao.getTelegramReplyChat('bot', 'peer', 'missing', 'topic')).toBeUndefined()
      dao.saveTelegramReceipt({ ...target(1, 'gold'), hostThreadId: undefined }, '300', 10)
      expect(dao.getTelegramReplyChat('bot', 'peer', '300')).toBe('gold')
      db.exec('DELETE FROM chats WHERE id = 2')
      expect(dao.getTelegramReplyChat('bot', 'peer', '200', 'topic')).toBeUndefined()
    } finally { db.close() }
  })
})

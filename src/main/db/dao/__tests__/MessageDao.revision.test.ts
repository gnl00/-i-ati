import type Database from 'better-sqlite3'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { MessageDao } from '../MessageDao'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => Pick<Database.Database, 'exec' | 'close' | 'prepare'>
}

// Exercise real SQL storage without Electron's native addon ABI.
describe('message revision storage', () => {
  it('stores the initial revision and preserves updated revisions on reads', () => {
    const db = new DatabaseSync(':memory:')
    try {
      db.exec(`CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER, chat_uuid TEXT, body TEXT NOT NULL, tokens INTEGER,
        token_usage TEXT, revision INTEGER NOT NULL DEFAULT 1)`)
      const dao = new MessageDao(db as unknown as Database.Database)
      const id = dao.insertMessage({ revision: 1, chat_id: 1, chat_uuid: 'chat',
        body: '{"role":"assistant","content":"partial"}', tokens: null, token_usage: null })
      const before = dao.getMessageById(id)!
      expect(before.revision).toBe(1)
      dao.updateMessage({ ...before, revision: 2, body: '{"role":"assistant","content":"final"}' })
      expect(dao.getMessagesByChatUuid('chat')[0].revision).toBe(2)
      expect(JSON.parse(dao.getMessageById(id)!.body).content).toBe('final')
    } finally { db.close() }
  })
})

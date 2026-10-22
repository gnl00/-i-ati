import type Database from 'better-sqlite3'
import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
import { ActivityJournalRepository } from '../ActivityJournalRepository'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => Pick<Database.Database, 'exec' | 'close' | 'prepare'>
}

it('lists recent activities across dates with stable ordering while preserving date and chat filters', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(`CREATE TABLE activity_journal_entries (
      id TEXT PRIMARY KEY, chat_uuid TEXT, chat_id INTEGER, title TEXT, details TEXT,
      category TEXT, level TEXT, tags_json TEXT, source TEXT, search_text TEXT,
      indexed INTEGER, created_at INTEGER);
      CREATE TABLE vec_activity_journal (entry_id TEXT PRIMARY KEY, embedding BLOB);`)
    const insert = db.prepare(`INSERT INTO activity_journal_entries
      (id, chat_uuid, title, created_at) VALUES (?, ?, ?, ?)`)
    for (const [id, chatUuid, date] of [
      ['older', 'current', '2026-10-16T12:00:00'],
      ['new-b', 'other', '2026-10-18T12:00:00'],
      ['new-a', 'current', '2026-10-18T12:00:00'],
      ['middle', 'other', '2026-10-17T12:00:00']
    ]) insert.run(id, chatUuid, id, new Date(date).getTime())
    // These read paths use real SQLite; the constructor's write transaction is unused.
    const repository = new ActivityJournalRepository(Object.assign(db, {
      transaction: (operation: unknown) => operation
    }) as unknown as Database.Database)
    expect(repository.listEntries({ limit: 3 }).map(row => row.id)).toEqual(['new-a', 'new-b', 'middle'])
    expect(repository.listEntries({ limit: 3, chatUuid: 'current' }).map(row => row.id)).toEqual(['new-a', 'older'])
    expect(repository.listEntries({ dateKey: '2026-10-17', limit: 3 }).map(row => row.id)).toEqual(['middle'])
    expect(repository.listEntries({ dateKey: '2026-10-18', limit: 3, chatUuid: 'other' }).map(row => row.id)).toEqual(['new-b'])
  } finally { db.close() }
})

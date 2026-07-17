import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MessageSearchDao } from '../MessageSearchDao'
import {
  CHAT_SEARCH_HIGHLIGHT_END,
  CHAT_SEARCH_HIGHLIGHT_START
} from '@shared/search/chatSearchHighlights'

const nativeSqliteAvailable = ((): boolean => {
  try {
    const probe = new Database(':memory:')
    probe.close()
    return true
  } catch {
    return false
  }
})()

describe.skipIf(!nativeSqliteAvailable)('MessageSearchDao', () => {
  let db: Database.Database | undefined

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    db.pragma('trusted_schema = OFF')
    createSearchSchema(db)
  })

  afterEach(() => {
    db?.close()
    db = undefined
  })

  it('backfills eligible messages and searches quoted trigram phrases with BM25 snippets', () => {
    const database = db!
    insertChat(database, 1, 'chat-1', 1_000)
    insertMessage(database, 1, 1, 'chat-1', {
      role: 'assistant',
      createdAt: 100,
      content: 'C++: OR parser',
      segments: [{
        type: 'text',
        segmentId: 'seg-1',
        content: 'C++:   OR\nparser handles alpha   beta',
        timestamp: 1
      }]
    })
    insertMessage(database, 2, 1, 'chat-1', {
      role: 'assistant',
      source: 'run_stopped',
      createdAt: 200,
      content: 'alpha beta hidden',
      segments: []
    })
    insertMessage(database, 3, 1, 'chat-1', {
      role: 'tool',
      createdAt: 300,
      content: 'alpha beta tool',
      segments: []
    })
    insertMessage(database, 4, null, null, {
      role: 'user',
      createdAt: 400,
      content: 'alpha beta orphan',
      segments: []
    })

    const dao = new MessageSearchDao(database)
    expect(dao.initializeProjection()).toBe(1)

    const punctuationMatches = dao.search(['c++: or'])
    expect(punctuationMatches).toHaveLength(1)
    expect(punctuationMatches[0]).toMatchObject({
      messageId: 1,
      chatUuid: 'chat-1',
      searchableText: 'C++: OR parser handles alpha beta'
    })
    expect(punctuationMatches[0].rank).toEqual(expect.any(Number))
    expect(punctuationMatches[0].snippet).toContain(CHAT_SEARCH_HIGHLIGHT_START)
    expect(punctuationMatches[0].snippet).toContain(CHAT_SEARCH_HIGHLIGHT_END)

    expect(dao.search(['alpha beta']).map(match => match.messageId)).toEqual([1])
  })

  it('uses a case-insensitive projection fallback for one and two character terms', () => {
    const database = db!
    insertChat(database, 1, 'chat-1', 1_000)
    insertMessage(database, 1, 1, 'chat-1', {
      role: 'user',
      createdAt: 100,
      content: 'FOO release',
      segments: []
    })

    const dao = new MessageSearchDao(database)
    dao.initializeProjection()

    expect(dao.search(['fo']).map(match => match.messageId)).toEqual([1])
  })

  it('uses Unicode-aware case folding for one and two character terms', () => {
    const database = db!
    insertChat(database, 1, 'chat-1', 1_000)
    insertMessage(database, 1, 1, 'chat-1', {
      role: 'user',
      createdAt: 100,
      content: 'Ä Журнал',
      segments: []
    })

    const dao = new MessageSearchDao(database)
    dao.initializeProjection()

    expect(dao.search(['ä']).map(match => match.messageId)).toEqual([1])
    expect(dao.search(['ж']).map(match => match.messageId)).toEqual([1])
  })

  it('keeps mixed long and short history terms as OR and pushes time and chat scope into SQL', () => {
    const database = db!
    insertChat(database, 1, 'chat-1', 1_000)
    insertChat(database, 2, 'chat-2', 2_000)
    insertMessage(database, 1, 1, 'chat-1', {
      role: 'user',
      createdAt: 100,
      content: 'implementation detail',
      segments: []
    })
    insertMessage(database, 2, 1, 'chat-1', {
      role: 'assistant',
      createdAt: 200,
      content: 'go',
      segments: []
    })
    insertMessage(database, 3, 2, 'chat-2', {
      role: 'assistant',
      createdAt: 300,
      content: 'implementation elsewhere',
      segments: []
    })

    const dao = new MessageSearchDao(database)
    dao.initializeProjection()

    expect(dao.search(['implementation', 'go'], {
      minCreatedAt: 150,
      chatUuid: 'chat-1'
    }).map(match => match.messageId)).toEqual([2])
  })

  it('rebuilds stale external-content index rows when the projection version changes', () => {
    const database = db!
    insertChat(database, 1, 'chat-1', 1_000)
    insertMessage(database, 1, 1, 'chat-1', {
      role: 'user',
      createdAt: 100,
      content: 'current searchable content',
      segments: []
    })
    insertMessage(database, 99, 1, 'chat-1', {
      role: 'tool',
      createdAt: 1,
      content: 'stale source placeholder',
      segments: []
    })
    database.prepare(`
      INSERT INTO message_search_documents (
        message_id, chat_id, chat_uuid, role, created_at, searchable_text
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(99, 1, 'chat-1', 'user', 1, 'stale searchable content')
    database.prepare(`
      INSERT INTO message_search_fts (rowid, searchable_text)
      VALUES (?, ?)
    `).run(99, 'stale searchable content')
    database.prepare(`
      INSERT INTO message_search_metadata (key, value)
      VALUES ('projection_version', '1')
    `).run()

    const dao = new MessageSearchDao(database)
    expect(dao.initializeProjection()).toBe(1)

    expect(dao.search(['stale'])).toHaveLength(0)
    expect(dao.search(['current']).map(match => match.messageId)).toEqual([1])
  })

  it('synchronizes updates and chat deletion without leaving stale FTS entries', () => {
    const database = db!
    insertChat(database, 1, 'chat-1', 1_000)
    insertMessage(database, 1, 1, 'chat-1', {
      role: 'user',
      createdAt: 100,
      content: 'first searchable value',
      segments: []
    })

    const dao = new MessageSearchDao(database)
    dao.initializeProjection()

    const updatedBody = JSON.stringify({
      role: 'assistant',
      createdAt: 200,
      content: 'second searchable value',
      segments: []
    })
    dao.runInTransaction(() => {
      database.prepare('UPDATE messages SET body = ? WHERE id = ?').run(updatedBody, 1)
      dao.syncMessage({
        id: 1,
        chat_id: 1,
        chat_uuid: 'chat-1',
        body: updatedBody,
        tokens: null,
        token_usage: null
      })
    })

    expect(dao.search(['first'])).toHaveLength(0)
    expect(dao.search(['second']).map(match => match.messageId)).toEqual([1])

    dao.runInTransaction(() => {
      dao.deleteChatMessages(1, 'chat-1')
      database.prepare('DELETE FROM chats WHERE id = ?').run(1)
    })

    expect(dao.search(['second'])).toHaveLength(0)
    expect(() => {
      database.prepare(`
        INSERT INTO message_search_fts (message_search_fts, rank)
        VALUES ('integrity-check', 1)
      `).run()
    }).not.toThrow()
  })

  it('uses the chat update time when a legacy message has no createdAt', () => {
    const database = db!
    insertChat(database, 1, 'chat-1', 9_999)
    insertMessage(database, 1, 1, 'chat-1', {
      role: 'user',
      content: 'legacy searchable value',
      segments: []
    })

    const dao = new MessageSearchDao(database)
    dao.initializeProjection()

    expect(dao.search(['legacy'])[0]?.createdAt).toBe(9_999)
  })

  it('skips parsed legacy bodies with invalid message shapes during backfill', () => {
    const database = db!
    insertChat(database, 1, 'chat-1', 1_000)
    insertMessage(database, 1, 1, 'chat-1', {
      role: 'user',
      createdAt: 100,
      content: 'valid searchable value',
      segments: []
    })
    insertMessage(database, 2, 1, 'chat-1', null)
    insertMessage(database, 3, 1, 'chat-1', {
      role: 'assistant',
      createdAt: 300,
      content: 'invalid segments value',
      segments: {}
    })
    insertMessage(database, 4, 1, 'chat-1', {
      role: 'assistant',
      createdAt: 400,
      content: 'invalid segment entry',
      segments: [null]
    })

    const dao = new MessageSearchDao(database)

    expect(dao.initializeProjection()).toBe(1)
    expect(dao.search(['valid']).map(match => match.messageId)).toEqual([1])
  })
})

function createSearchSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE chats (
      id INTEGER PRIMARY KEY,
      uuid TEXT NOT NULL UNIQUE,
      update_time INTEGER NOT NULL
    );

    CREATE TABLE messages (
      id INTEGER PRIMARY KEY,
      chat_id INTEGER,
      chat_uuid TEXT,
      body TEXT NOT NULL,
      tokens INTEGER,
      token_usage TEXT,
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
    );

    CREATE TABLE message_search_documents (
      message_id INTEGER PRIMARY KEY,
      chat_id INTEGER,
      chat_uuid TEXT,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      created_at INTEGER NOT NULL,
      searchable_text TEXT NOT NULL,
      searchable_text_folded TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    );

    CREATE TABLE message_search_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE message_search_fts USING fts5(
      searchable_text,
      content='message_search_documents',
      content_rowid='message_id',
      tokenize='trigram'
    );
  `)
}

function insertChat(
  db: Database.Database,
  id: number,
  uuid: string,
  updateTime: number
): void {
  db.prepare(`
    INSERT INTO chats (id, uuid, update_time)
    VALUES (?, ?, ?)
  `).run(id, uuid, updateTime)
}

function insertMessage(
  db: Database.Database,
  id: number,
  chatId: number | null,
  chatUuid: string | null,
  body: unknown
): void {
  db.prepare(`
    INSERT INTO messages (id, chat_id, chat_uuid, body, tokens, token_usage)
    VALUES (?, ?, ?, ?, NULL, NULL)
  `).run(id, chatId, chatUuid, JSON.stringify(body))
}

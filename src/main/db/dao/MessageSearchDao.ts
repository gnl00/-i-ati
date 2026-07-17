import type Database from 'better-sqlite3'
import type { MessageRow } from './MessageDao'
import { extractSearchableMessageText } from '@main/services/messages/MessageSegmentContent'
import { HIDDEN_MESSAGE_SOURCES } from '@shared/messages/messageSources'
import {
  CHAT_SEARCH_HIGHLIGHT_END,
  CHAT_SEARCH_HIGHLIGHT_START
} from '@shared/search/chatSearchHighlights'

const MESSAGE_SEARCH_PROJECTION_VERSION = '2'
const MESSAGE_SEARCH_PROJECTION_VERSION_KEY = 'projection_version'
const MESSAGE_SEARCH_BACKFILL_BATCH_SIZE = 250

export type MessageSearchDocument = {
  messageId: number
  chatId: number | null
  chatUuid: string | null
  role: 'user' | 'assistant'
  createdAt: number
  searchableText: string
}

export type MessageSearchMatch = MessageSearchDocument & {
  rank?: number
  snippet?: string
}

type SearchFilters = {
  minCreatedAt?: number
  chatUuid?: string
}

type MessageSearchDocumentRow = {
  message_id: number
  chat_id: number | null
  chat_uuid: string | null
  role: 'user' | 'assistant'
  created_at: number
  searchable_text: string
  searchable_text_folded: string
}

type MessageSearchMatchRow = MessageSearchDocumentRow & {
  rank: number | null
  snippet: string | null
}

type BackfillMessageRow = MessageRow & {
  fallback_created_at: number | null
}

export class MessageSearchDao {
  private readonly getProjectionVersionStmt: Database.Statement
  private readonly setProjectionVersionStmt: Database.Statement
  private readonly getDocumentStmt: Database.Statement
  private readonly insertDocumentStmt: Database.Statement
  private readonly deleteDocumentStmt: Database.Statement
  private readonly insertFtsDocumentStmt: Database.Statement
  private readonly deleteFtsDocumentStmt: Database.Statement
  private readonly rebuildFtsStmt: Database.Statement
  private readonly getBackfillRowsStmt: Database.Statement
  private readonly getChatUpdateTimeStmt: Database.Statement

  constructor(private readonly db: Database.Database) {
    this.getProjectionVersionStmt = db.prepare(`
      SELECT value
      FROM message_search_metadata
      WHERE key = ?
    `)
    this.setProjectionVersionStmt = db.prepare(`
      INSERT INTO message_search_metadata (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `)
    this.getDocumentStmt = db.prepare(`
      SELECT *
      FROM message_search_documents
      WHERE message_id = ?
    `)
    this.insertDocumentStmt = db.prepare(`
      INSERT INTO message_search_documents (
        message_id,
        chat_id,
        chat_uuid,
        role,
        created_at,
        searchable_text,
        searchable_text_folded
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    this.deleteDocumentStmt = db.prepare(`
      DELETE FROM message_search_documents
      WHERE message_id = ?
    `)
    this.insertFtsDocumentStmt = db.prepare(`
      INSERT INTO message_search_fts (rowid, searchable_text)
      VALUES (?, ?)
    `)
    this.deleteFtsDocumentStmt = db.prepare(`
      INSERT INTO message_search_fts (
        message_search_fts,
        rowid,
        searchable_text
      )
      VALUES ('delete', ?, ?)
    `)
    this.rebuildFtsStmt = db.prepare(`
      INSERT INTO message_search_fts (message_search_fts)
      VALUES ('rebuild')
    `)
    this.getBackfillRowsStmt = db.prepare(`
      SELECT
        messages.*,
        COALESCE(
          (
            SELECT chats.update_time
            FROM chats
            WHERE chats.id = messages.chat_id
          ),
          (
            SELECT chats.update_time
            FROM chats
            WHERE chats.uuid = messages.chat_uuid
          ),
          0
        ) AS fallback_created_at
      FROM messages
      WHERE messages.id > ?
      ORDER BY messages.id ASC
      LIMIT ?
    `)
    this.getChatUpdateTimeStmt = db.prepare(`
      SELECT update_time
      FROM chats
      WHERE (? IS NOT NULL AND id = ?)
        OR (? IS NOT NULL AND uuid = ?)
      ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END
      LIMIT 1
    `)
  }

  initializeProjection(): number {
    const versionRow = this.getProjectionVersionStmt.get(
      MESSAGE_SEARCH_PROJECTION_VERSION_KEY
    ) as { value: string } | undefined
    if (versionRow?.value === MESSAGE_SEARCH_PROJECTION_VERSION) {
      return 0
    }

    return this.runInTransaction(() => {
      this.db.prepare('DELETE FROM message_search_documents').run()

      let indexedCount = 0
      let lastMessageId = 0
      for (;;) {
        const rows = this.getBackfillRowsStmt.all(
          lastMessageId,
          MESSAGE_SEARCH_BACKFILL_BATCH_SIZE
        ) as BackfillMessageRow[]
        if (rows.length === 0) {
          break
        }

        for (const row of rows) {
          const document = projectMessageSearchDocument(row, row.fallback_created_at ?? 0)
          if (document) {
            this.insertDocument(document)
            indexedCount += 1
          }
        }
        lastMessageId = rows[rows.length - 1].id
      }

      this.rebuildFtsStmt.run()
      this.setProjectionVersionStmt.run(
        MESSAGE_SEARCH_PROJECTION_VERSION_KEY,
        MESSAGE_SEARCH_PROJECTION_VERSION
      )
      return indexedCount
    })
  }

  runInTransaction<T>(operation: () => T): T {
    return this.db.transaction(operation)()
  }

  syncMessage(row: MessageRow): void {
    const existing = this.getDocument(row.id)
    const fallbackCreatedAt = existing?.createdAt ?? this.resolveChatUpdateTime(row)
    const next = projectMessageSearchDocument(row, fallbackCreatedAt)

    if (existing) {
      this.deleteFtsDocumentStmt.run(existing.messageId, existing.searchableText)
      this.deleteDocumentStmt.run(existing.messageId)
    }

    if (!next) {
      return
    }

    this.insertDocument(next)
    this.insertFtsDocumentStmt.run(next.messageId, next.searchableText)
  }

  deleteMessage(messageId: number): void {
    const existing = this.getDocument(messageId)
    if (!existing) {
      return
    }

    this.deleteFtsDocumentStmt.run(existing.messageId, existing.searchableText)
    this.deleteDocumentStmt.run(existing.messageId)
  }

  deleteChatMessages(chatId: number, chatUuid?: string): void {
    const rows = this.db.prepare(`
      SELECT *
      FROM message_search_documents
      WHERE chat_id = ?
        OR (? IS NOT NULL AND chat_uuid = ?)
    `).all(chatId, chatUuid ?? null, chatUuid ?? null) as MessageSearchDocumentRow[]

    for (const row of rows) {
      const document = toDocument(row)
      this.deleteFtsDocumentStmt.run(document.messageId, document.searchableText)
      this.deleteDocumentStmt.run(document.messageId)
    }
  }

  search(queryTerms: string[], filters: SearchFilters = {}): MessageSearchMatch[] {
    const normalizedTerms = normalizeQueryTerms(queryTerms)
    if (normalizedTerms.length === 0) {
      return []
    }

    const longTerms = normalizedTerms.filter(term => codePointLength(term) >= 3)
    const shortTerms = normalizedTerms.filter(term => codePointLength(term) < 3)
    const matches = new Map<number, MessageSearchMatch>()

    if (longTerms.length > 0) {
      for (const match of this.searchFts(longTerms, filters)) {
        matches.set(match.messageId, match)
      }
    }

    if (shortTerms.length > 0) {
      for (const match of this.searchShortTerms(shortTerms, filters)) {
        const existing = matches.get(match.messageId)
        if (!existing) {
          matches.set(match.messageId, match)
        }
      }
    }

    return Array.from(matches.values()).sort((a, b) => {
      const aRank = a.rank ?? Number.POSITIVE_INFINITY
      const bRank = b.rank ?? Number.POSITIVE_INFINITY
      if (aRank !== bRank) {
        return aRank - bRank
      }
      return b.createdAt - a.createdAt || b.messageId - a.messageId
    })
  }

  getRecentDocuments(filters: SearchFilters = {}): MessageSearchDocument[] {
    const clauses: string[] = []
    const params: Array<number | string> = []
    appendFilters(clauses, params, filters, 'message_search_documents')
    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
    const rows = this.db.prepare(`
      SELECT *
      FROM message_search_documents
      ${whereClause}
      ORDER BY created_at DESC, message_id DESC
    `).all(...params) as MessageSearchDocumentRow[]

    return rows.map(toDocument)
  }

  private searchFts(queryTerms: string[], filters: SearchFilters): MessageSearchMatch[] {
    const clauses = ['message_search_fts MATCH ?']
    const params: Array<number | string> = [buildFtsOrQuery(queryTerms)]
    appendFilters(clauses, params, filters, 'documents')

    const rows = this.db.prepare(`
      SELECT
        documents.*,
        bm25(message_search_fts) AS rank,
        snippet(
          message_search_fts,
          0,
          ?,
          ?,
          '...',
          32
        ) AS snippet
      FROM message_search_fts
      JOIN message_search_documents AS documents
        ON documents.message_id = message_search_fts.rowid
      WHERE ${clauses.join(' AND ')}
      ORDER BY rank ASC, documents.created_at DESC, documents.message_id DESC
    `).all(
      CHAT_SEARCH_HIGHLIGHT_START,
      CHAT_SEARCH_HIGHLIGHT_END,
      ...params
    ) as MessageSearchMatchRow[]

    return rows.map(toMatch)
  }

  private searchShortTerms(queryTerms: string[], filters: SearchFilters): MessageSearchMatch[] {
    const termClauses = queryTerms.map(() => 'instr(searchable_text_folded, ?) > 0')
    const clauses = [`(${termClauses.join(' OR ')})`]
    const params: Array<number | string> = [...queryTerms]
    appendFilters(clauses, params, filters, 'message_search_documents')

    const rows = this.db.prepare(`
      SELECT
        message_search_documents.*,
        NULL AS rank,
        NULL AS snippet
      FROM message_search_documents
      WHERE ${clauses.join(' AND ')}
      ORDER BY created_at DESC, message_id DESC
    `).all(...params) as MessageSearchMatchRow[]

    return rows.map(toMatch)
  }

  private getDocument(messageId: number): MessageSearchDocument | undefined {
    const row = this.getDocumentStmt.get(messageId) as MessageSearchDocumentRow | undefined
    return row ? toDocument(row) : undefined
  }

  private insertDocument(document: MessageSearchDocument): void {
    this.insertDocumentStmt.run(
      document.messageId,
      document.chatId,
      document.chatUuid,
      document.role,
      document.createdAt,
      document.searchableText,
      foldSearchText(document.searchableText)
    )
  }

  private resolveChatUpdateTime(row: MessageRow): number {
    const result = this.getChatUpdateTimeStmt.get(
      row.chat_id,
      row.chat_id,
      row.chat_uuid,
      row.chat_uuid,
      row.chat_id
    ) as { update_time: number } | undefined
    return result?.update_time ?? Date.now()
  }
}

function projectMessageSearchDocument(
  row: MessageRow,
  fallbackCreatedAt: number
): MessageSearchDocument | null {
  let parsedBody: unknown
  try {
    parsedBody = JSON.parse(row.body) as unknown
  } catch {
    return null
  }

  if (!isProjectableMessage(parsedBody)) {
    return null
  }

  const message = parsedBody
  if (
    (message.source && HIDDEN_MESSAGE_SOURCES.has(message.source))
    || (!row.chat_id && !row.chat_uuid)
  ) {
    return null
  }

  const searchableText = normalizeDocumentText(extractSearchableMessageText(message))
  if (!searchableText) {
    return null
  }

  return {
    messageId: row.id,
    chatId: row.chat_id,
    chatUuid: row.chat_uuid,
    role: message.role,
    createdAt: typeof message.createdAt === 'number' && Number.isFinite(message.createdAt)
      ? message.createdAt
      : fallbackCreatedAt,
    searchableText
  }
}

function isProjectableMessage(value: unknown): value is ChatMessage & {
  role: 'user' | 'assistant'
} {
  if (!isRecord(value) || (value.role !== 'user' && value.role !== 'assistant')) {
    return false
  }

  if (
    typeof value.content !== 'string'
    && (
      !Array.isArray(value.content)
      || !value.content.every(isRecord)
    )
  ) {
    return false
  }

  return value.segments === undefined
    || (
      Array.isArray(value.segments)
      && value.segments.every(isRecord)
    )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeDocumentText(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function normalizeQueryTerms(queryTerms: string[]): string[] {
  const terms = queryTerms
    .map(term => foldSearchText(term.trim().replace(/\s+/g, ' ')))
    .filter(Boolean)
  return Array.from(new Set(terms))
}

function foldSearchText(value: string): string {
  return value.toLowerCase()
}

function buildFtsOrQuery(queryTerms: string[]): string {
  return queryTerms
    .map(term => `"${term.replace(/"/g, '""')}"`)
    .join(' OR ')
}

function codePointLength(value: string): number {
  return Array.from(value).length
}

function appendFilters(
  clauses: string[],
  params: Array<number | string>,
  filters: SearchFilters,
  tableAlias: string
): void {
  if (typeof filters.minCreatedAt === 'number') {
    clauses.push(`${tableAlias}.created_at >= ?`)
    params.push(filters.minCreatedAt)
  }
  if (filters.chatUuid) {
    clauses.push(`${tableAlias}.chat_uuid = ?`)
    params.push(filters.chatUuid)
  }
}

function toDocument(row: MessageSearchDocumentRow): MessageSearchDocument {
  return {
    messageId: row.message_id,
    chatId: row.chat_id,
    chatUuid: row.chat_uuid,
    role: row.role,
    createdAt: row.created_at,
    searchableText: row.searchable_text
  }
}

function toMatch(row: MessageSearchMatchRow): MessageSearchMatch {
  return {
    ...toDocument(row),
    ...(typeof row.rank === 'number' ? { rank: row.rank } : {}),
    ...(row.snippet ? { snippet: row.snippet } : {})
  }
}

import { app } from 'electron'
import path from 'path'
import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import type {
  ActivityJournalAppendInput,
  ActivityJournalAppendResult,
  ActivityJournalEntryRow,
  ActivityJournalListOptions,
  ActivityJournalSearchOptions,
  ActivityJournalSearchRow
} from './types'
import type {
  ActivityJournalCategory,
  ActivityJournalEntry,
  ActivityJournalSearchItem
} from '@tools/activityJournal/index.d'
import { createLogger } from '@main/services/logging/LogService'
import { loadSqliteVecExtension } from '@main/services/sqlite/loadSqliteVec'
import { ActivityJournalRepository } from './ActivityJournalRepository'
import EmbeddingServiceInstance from '../embedding/EmbeddingService'

interface EmbeddingServiceLike {
  generateEmbedding: (text: string) => Promise<{ embedding: number[] }>
}

interface ActivityJournalServiceOptions {
  resolveBaseDir?: () => string
  embeddingService?: EmbeddingServiceLike
}

function resolveDefaultEmbeddingService(): EmbeddingServiceLike {
  return EmbeddingServiceInstance
}

const INDEXED_CATEGORIES = new Set<ActivityJournalCategory>(['task', 'plan', 'decision', 'blocker', 'summary'])

function toDateKey(input: Date): string {
  const year = input.getFullYear()
  const month = `${input.getMonth() + 1}`.padStart(2, '0')
  const day = `${input.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildSearchText(title: string, details?: string): string {
  return [title.trim(), details?.trim()].filter(Boolean).join('\n\n')
}

function shouldIndex(category: ActivityJournalCategory): boolean {
  return INDEXED_CATEGORIES.has(category)
}

function rowToEntry(row: Omit<ActivityJournalEntryRow, 'search_text'>): ActivityJournalEntry {
  return {
    id: row.id,
    chatUuid: row.chat_uuid ?? undefined,
    chatId: row.chat_id ?? undefined,
    title: row.title,
    details: row.details ?? undefined,
    category: row.category,
    level: row.level,
    tags: row.tags_json ? JSON.parse(row.tags_json) : undefined,
    source: row.source,
    createdAt: row.created_at,
    indexed: row.indexed === 1
  }
}

function rowToSearchItem(row: ActivityJournalSearchRow, score: number): ActivityJournalSearchItem {
  const base = rowToEntry(row)
  return {
    ...base,
    similarity: Number((1 - row.distance).toFixed(4)),
    score: Number(score.toFixed(4))
  }
}

export class ActivityJournalService {
  private readonly logger = createLogger('ActivityJournalService')
  private db: Database.Database | null = null
  private repo: ActivityJournalRepository | null = null
  private initialized = false
  private readonly resolveBaseDir: () => string
  private embeddingService?: EmbeddingServiceLike

  constructor(options: ActivityJournalServiceOptions = {}) {
    this.resolveBaseDir = options.resolveBaseDir ?? (() => app.getPath('userData'))
    this.embeddingService = options.embeddingService
  }

  private getDbPath(): string {
    return path.join(this.resolveBaseDir(), 'activity-journal.db')
  }

  async initialize(): Promise<void> {
    if (this.initialized) return

    const dbPath = this.getDbPath()
    this.logger.info('initialize.start', { dbPath })
    this.db = new Database(dbPath)
    loadSqliteVecExtension(this.db, this.logger)
    this.db.pragma('journal_mode = WAL')

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS activity_journal_entries (
        id TEXT PRIMARY KEY,
        chat_uuid TEXT,
        chat_id INTEGER,
        title TEXT NOT NULL,
        details TEXT,
        category TEXT NOT NULL,
        level TEXT NOT NULL,
        tags_json TEXT,
        source TEXT NOT NULL,
        search_text TEXT NOT NULL,
        indexed INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      )
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_activity_journal_created_at ON activity_journal_entries(created_at);
      CREATE INDEX IF NOT EXISTS idx_activity_journal_chat_uuid ON activity_journal_entries(chat_uuid);
      CREATE INDEX IF NOT EXISTS idx_activity_journal_category ON activity_journal_entries(category);
    `)

    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_activity_journal USING vec0(
        entry_id TEXT PRIMARY KEY,
        embedding FLOAT[384]
      )
    `)

    this.repo = new ActivityJournalRepository(this.db)
    this.initialized = true
    this.logger.info('initialize.completed')
  }

  async appendEntry(input: ActivityJournalAppendInput): Promise<ActivityJournalAppendResult> {
    await this.initialize()
    if (!this.repo) {
      throw new Error('Activity journal repository not initialized')
    }

    const now = input.createdAt ?? Date.now()
    const normalizedTitle = input.title.trim()
    const normalizedDetails = input.details?.trim() || undefined
    const normalizedLevel = input.level ?? 'info'
    const normalizedTags = input.tags?.map(tag => tag.trim()).filter(Boolean) ?? []
    const shouldAttemptIndex = shouldIndex(input.category)
    const searchText = buildSearchText(normalizedTitle, normalizedDetails)
    let indexed: 0 | 1 = 0

    const row: ActivityJournalEntryRow = {
      id: uuidv4(),
      chat_uuid: input.chatUuid ?? null,
      chat_id: input.chatId ?? null,
      title: normalizedTitle,
      details: normalizedDetails ?? null,
      category: input.category,
      level: normalizedLevel,
      tags_json: normalizedTags.length > 0 ? JSON.stringify(normalizedTags) : null,
      source: 'model',
      search_text: searchText,
      indexed,
      created_at: now
    }

    let vectorBuffer: Buffer | undefined
    if (shouldAttemptIndex && searchText) {
      try {
        const { embedding } = await this.getEmbeddingService().generateEmbedding(searchText)
        const vector = new Float32Array(embedding)
        vectorBuffer = Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength)
        indexed = 1
        row.indexed = indexed
      } catch (error) {
        this.logger.warn('append.embedding_failed', {
          entryId: row.id,
          category: row.category,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    this.repo.saveEntry(row, vectorBuffer)

    return {
      entry: rowToEntry(row),
      indexed: row.indexed === 1
    }
  }

  async listEntries(options: ActivityJournalListOptions): Promise<ActivityJournalEntry[]> {
    await this.initialize()
    if (!this.repo) {
      throw new Error('Activity journal repository not initialized')
    }

    return this.repo.listEntries(options).map(row => rowToEntry(row))
  }

  async searchEntries(
    query: string,
    options: {
      limit: number
      withinDays: number
      chatUuid?: string
    }
  ): Promise<ActivityJournalSearchItem[]> {
    await this.initialize()
    if (!this.repo) {
      throw new Error('Activity journal repository not initialized')
    }

    const trimmedQuery = query.trim()
    if (!trimmedQuery) {
      return []
    }

    const topK = Math.min(Math.max(options.limit * 3, options.limit), 100)
    const withinDays = Math.min(Math.max(Math.floor(options.withinDays), 1), 90)
    const startAt = Date.now() - (withinDays * 86400000)

    const { embedding } = await this.getEmbeddingService().generateEmbedding(trimmedQuery)
    const queryVector = new Float32Array(embedding)
    const queryBuffer = Buffer.from(queryVector.buffer, queryVector.byteOffset, queryVector.byteLength)

    const rows = this.repo.searchEntries(queryBuffer, {
      topK,
      chatUuid: options.chatUuid,
      startAt
    } satisfies ActivityJournalSearchOptions)

    return rows
      .map((row) => {
        const ageMs = Math.max(Date.now() - row.created_at, 0)
        const ageDays = ageMs / 86400000
        const recencyScore = Math.max(0, 1 - (ageDays / withinDays))
        const similarity = 1 - row.distance
        const score = (similarity * 0.85) + (recencyScore * 0.15)
        return rowToSearchItem(row, score)
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, options.limit)
  }

  getDateKey(input = new Date()): string {
    return toDateKey(input)
  }

  private getEmbeddingService(): EmbeddingServiceLike {
    if (!this.embeddingService) {
      this.embeddingService = resolveDefaultEmbeddingService()
    }
    return this.embeddingService
  }

  close(): void {
    this.db?.close()
    this.db = null
    this.repo = null
    this.initialized = false
  }
}

const activityJournalService = new ActivityJournalService()

export default activityJournalService

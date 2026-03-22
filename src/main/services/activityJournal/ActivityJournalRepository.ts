import Database from 'better-sqlite3'
import type {
  ActivityJournalEntryRow,
  ActivityJournalListOptions,
  ActivityJournalSearchOptions,
  ActivityJournalSearchRow,
  ActivityJournalVectorRow
} from './types'

export class ActivityJournalRepository {
  private readonly stmts: {
    insertEntry: Database.Statement
    insertVector: Database.Statement
    listEntriesByDate: Database.Statement
    listEntriesByDateAndChat: Database.Statement
  }
  private readonly saveEntryTxn: (row: ActivityJournalEntryRow, vectorEmbedding?: Buffer) => void

  constructor(private readonly db: Database.Database) {
    this.stmts = {
      insertEntry: this.db.prepare(`
        INSERT INTO activity_journal_entries (
          id, chat_uuid, chat_id, title, details, category, level, tags_json, source, search_text, indexed, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      insertVector: this.db.prepare(`
        INSERT OR REPLACE INTO vec_activity_journal(entry_id, embedding) VALUES (?, ?)
      `),
      listEntriesByDate: this.db.prepare(`
        SELECT id, chat_uuid, chat_id, title, details, category, level, tags_json, source, indexed, created_at
        FROM activity_journal_entries
        WHERE created_at >= ? AND created_at < ?
        ORDER BY created_at DESC
        LIMIT ?
      `),
      listEntriesByDateAndChat: this.db.prepare(`
        SELECT id, chat_uuid, chat_id, title, details, category, level, tags_json, source, indexed, created_at
        FROM activity_journal_entries
        WHERE created_at >= ? AND created_at < ? AND chat_uuid = ?
        ORDER BY created_at DESC
        LIMIT ?
      `)
    }
    this.saveEntryTxn = this.db.transaction((row: ActivityJournalEntryRow, vectorEmbedding?: Buffer) => {
      this.insertEntry(row)
      if (vectorEmbedding) {
        this.insertVector({
          entry_id: row.id,
          embedding: vectorEmbedding
        })
      }
    })
  }

  private insertEntry(row: ActivityJournalEntryRow): void {
    this.stmts.insertEntry.run(
      row.id,
      row.chat_uuid,
      row.chat_id,
      row.title,
      row.details,
      row.category,
      row.level,
      row.tags_json,
      row.source,
      row.search_text,
      row.indexed,
      row.created_at
    )
  }

  private insertVector(row: ActivityJournalVectorRow): void {
    this.stmts.insertVector.run(row.entry_id, row.embedding)
  }

  saveEntry(row: ActivityJournalEntryRow, vectorEmbedding?: Buffer): void {
    this.saveEntryTxn(row, vectorEmbedding)
  }

  listEntries(options: ActivityJournalListOptions): Omit<ActivityJournalEntryRow, 'search_text'>[] {
    const startAt = new Date(`${options.dateKey}T00:00:00`).getTime()
    const endAt = startAt + 86400000

    if (options.chatUuid) {
      return this.stmts.listEntriesByDateAndChat.all(startAt, endAt, options.chatUuid, options.limit) as Omit<ActivityJournalEntryRow, 'search_text'>[]
    }

    return this.stmts.listEntriesByDate.all(startAt, endAt, options.limit) as Omit<ActivityJournalEntryRow, 'search_text'>[]
  }

  searchEntries(queryBuffer: Buffer, options: ActivityJournalSearchOptions): ActivityJournalSearchRow[] {
    const whereConditions: string[] = []
    const params: Array<Buffer | string | number> = []

    if (options.chatUuid) {
      whereConditions.push('e.chat_uuid = ?')
      params.push(options.chatUuid)
    }

    if (options.startAt) {
      whereConditions.push('e.created_at >= ?')
      params.push(options.startAt)
    }

    const additionalConditions = whereConditions.length > 0
      ? ` AND ${whereConditions.join(' AND ')}`
      : ''

    const sql = `
      SELECT
        e.id,
        e.chat_uuid,
        e.chat_id,
        e.title,
        e.details,
        e.category,
        e.level,
        e.tags_json,
        e.source,
        e.indexed,
        e.created_at,
        vec_distance_cosine(v.embedding, ?) as distance
      FROM vec_activity_journal v
      INNER JOIN activity_journal_entries e ON v.entry_id = e.id
      WHERE 1=1${additionalConditions}
      ORDER BY distance ASC
      LIMIT ?
    `

    return this.db.prepare(sql).all(
      queryBuffer,
      ...params,
      Math.max(options.topK, 1)
    ) as ActivityJournalSearchRow[]
  }
}

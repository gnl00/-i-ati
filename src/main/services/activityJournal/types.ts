import type { ActivityJournalCategory, ActivityJournalEntry, ActivityJournalLevel } from '@tools/activityJournal/index.d'

export interface ActivityJournalEntryRow {
  id: string
  chat_uuid: string | null
  chat_id: number | null
  title: string
  details: string | null
  category: ActivityJournalCategory
  level: ActivityJournalLevel
  tags_json: string | null
  source: 'model'
  search_text: string
  indexed: 0 | 1
  created_at: number
}

export interface ActivityJournalVectorRow {
  entry_id: string
  embedding: Buffer
}

export interface ActivityJournalAppendInput {
  chatUuid?: string
  chatId?: number
  title: string
  details?: string
  category: ActivityJournalCategory
  level?: ActivityJournalLevel
  tags?: string[]
  createdAt?: number
}

export interface ActivityJournalListOptions {
  dateKey: string
  limit: number
  chatUuid?: string
}

export interface ActivityJournalSearchOptions {
  topK: number
  chatUuid?: string
  startAt?: number
}

export interface ActivityJournalSearchRow extends Omit<ActivityJournalEntryRow, 'search_text'> {
  distance: number
}

export interface ActivityJournalAppendResult {
  entry: ActivityJournalEntry
  indexed: boolean
}

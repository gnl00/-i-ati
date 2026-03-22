export type ActivityJournalCategory = 'task' | 'plan' | 'tool' | 'decision' | 'blocker' | 'summary' | 'note'

export type ActivityJournalLevel = 'info' | 'important' | 'warning'

export interface ActivityJournalEntry {
  id: string
  chatUuid?: string
  chatId?: number
  title: string
  details?: string
  category: ActivityJournalCategory
  level: ActivityJournalLevel
  tags?: string[]
  source: 'model'
  createdAt: number
  indexed: boolean
}

export interface ActivityJournalAppendResponse {
  success: boolean
  entry?: ActivityJournalEntry
  indexed: boolean
  message: string
}

export interface ActivityJournalListResponse {
  success: boolean
  date: string
  count: number
  entries: ActivityJournalEntry[]
  message: string
}

export interface ActivityJournalSearchItem extends ActivityJournalEntry {
  similarity: number
  score: number
}

export interface ActivityJournalSearchResponse {
  success: boolean
  count: number
  entries: ActivityJournalSearchItem[]
  message: string
}

export type HistorySearchScope = 'all' | 'current_chat'

export interface HistorySearchArgs {
  query?: string
  limit: number
  scope?: HistorySearchScope
  withinDays?: number
  chat_uuid?: string
}

export interface HistorySearchMessage {
  id?: number
  role: 'user' | 'assistant'
  createdAt?: number
  text: string
}

export interface HistorySearchItem {
  chatUuid: string
  chatId?: number
  chatTitle: string
  matchedMessageId?: number
  matchedFields: Array<'title' | 'message'>
  hitCount: number
  createdAt: number
  snippet: string
  messages: HistorySearchMessage[]
}

export interface HistorySearchResponse {
  success: boolean
  count: number
  items: HistorySearchItem[]
  message: string
}

export interface WikiListArgs {}
export interface WikiEntry {
  name: string
  title: string
  type: string
  tags: string[]
  created: string
  updated: string
  source: string
  summary: string
}
export interface WikiListResponse {
  success: boolean
  entries: WikiEntry[]
  index_source?: WikiListIndexSource
  message?: string
}
export type WikiListIndexSource = 'readme' | 'scan'

export interface WikiReadArgs {
  name: string
}
export interface WikiReadResponse {
  success: boolean
  name: string
  title?: string
  content?: string
  metadata?: Record<string, any>
  message?: string
}

export interface WikiWriteArgs {
  name: string
  content: string
  mode?: WikiWriteMode
}
export type WikiWriteMode = 'upsert' | 'create' | 'append' | 'replace'
export interface WikiWriteResponse {
  success: boolean
  name: string
  title?: string
  message: string
  index_status?: WikiIndexStatus
  index_message?: string
}

export interface WikiDeleteArgs {
  name: string
}
export interface WikiDeleteResponse {
  success: boolean
  name: string
  message: string
  index_status?: WikiIndexStatus
  index_message?: string
}

export type WikiIndexStatus = 'queued' | 'running' | 'fresh' | 'stale' | 'unknown'

export interface WikiSearchArgs {
  query: string
  localized_query: string
  top_k?: number
  threshold?: number
}
export type WikiSearchMatchSource = 'vector' | 'readme' | 'hybrid'
export interface WikiSearchResultItem {
  entry_name: string
  title: string
  summary?: string
  text: string
  score: number
  similarity: number
  match_source: WikiSearchMatchSource
  match_reason: string
}
export interface WikiSearchResponse {
  success: boolean
  query: string
  total_hits: number
  results: WikiSearchResultItem[]
  index_status?: WikiIndexStatus
  index_message?: string
  message?: string
}

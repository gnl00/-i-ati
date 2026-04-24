export interface KnowledgebaseSearchArgs {
  query: string
  localized_query: string
  top_k?: number
  threshold?: number
  folders?: string[]
  extensions?: string[]
}

export interface KnowledgebaseSearchResultItem {
  chunk_id: string
  document_id: string
  file_path: string
  file_name: string
  folder_path: string
  ext: string
  text: string
  chunk_index: number
  score: number
  similarity: number
  char_start: number
  char_end: number
  token_estimate: number
}

export interface KnowledgebaseSearchResponse {
  success: boolean
  query: string
  total_hits: number
  results: KnowledgebaseSearchResultItem[]
  message?: string
}

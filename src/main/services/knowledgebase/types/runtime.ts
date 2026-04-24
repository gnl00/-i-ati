export type KnowledgebaseIndexState =
  | 'idle'
  | 'scanning'
  | 'chunking'
  | 'embedding'
  | 'completed'
  | 'failed'

export interface KnowledgebaseStats {
  documentCount: number
  chunkCount: number
  indexedDocumentCount: number
  lastIndexedAt?: number
}

export interface KnowledgebaseIndexStatus {
  state: KnowledgebaseIndexState
  totalFiles: number
  processedFiles: number
  totalChunks: number
  processedChunks: number
  message?: string
  updatedAt: number
}

export interface KnowledgebaseSearchOptions {
  topK: number
  threshold?: number
  folders?: string[]
  extensions?: string[]
}

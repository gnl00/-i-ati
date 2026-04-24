import type {
  KnowledgebaseChunkCandidate,
  KnowledgebaseIndexableFile
} from '../types'

export interface IndexStrategyInput {
  file: KnowledgebaseIndexableFile
  rawText: string
  chunkSize: number
  chunkOverlap: number
}

export interface PreparedKnowledgebaseDocument {
  strategyName: string
  normalizedText: string
  chunks: KnowledgebaseChunkCandidate[]
  sharedMetadata: Record<string, unknown>
}

export interface IndexStrategy {
  readonly name: string
  supports: (file: KnowledgebaseIndexableFile) => boolean
  prepare: (input: IndexStrategyInput) => PreparedKnowledgebaseDocument
}

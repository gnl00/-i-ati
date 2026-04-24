export interface KnowledgebaseIndexableFile {
  folderPath: string
  filePath: string
  fileName: string
  ext: string
  size: number
  mtimeMs: number
}

export interface KnowledgebaseChunkMetadata {
  headingPaths?: string[]
  headingDepth?: number
  primaryHeadingPath?: string
}

export interface KnowledgebaseChunkCandidate {
  text: string
  chunkIndex: number
  charStart: number
  charEnd: number
  tokenEstimate: number
  metadata?: KnowledgebaseChunkMetadata
}

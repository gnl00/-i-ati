import type Database from 'better-sqlite3'

export interface KnowledgebaseDocumentRow {
  id: string
  folder_path: string
  file_path: string
  file_name: string
  ext: string
  size: number
  mtime_ms: number
  content_hash: string
  status: 'indexed' | 'error' | 'skipped'
  error: string | null
  chunk_count: number
  updated_at: number
  last_indexed_at: number | null
}

export interface KnowledgebaseChunkRow {
  id: string
  document_id: string
  chunk_index: number
  text: string
  char_start: number
  char_end: number
  token_estimate: number
  chunk_hash: string
  metadata_json: string | null
}

export interface KnowledgebaseChunkSearchRow {
  id: string
  document_id: string
  chunk_index: number
  text: string
  char_start: number
  char_end: number
  token_estimate: number
  chunk_hash: string
  metadata_json: string | null
  file_path: string
  file_name: string
  ext: string
  folder_path: string
  distance: number
}

export interface KnowledgebaseEmbeddingCacheRow {
  cache_key: string
  model: string
  strategy_version: string
  chunk_hash: string
  embedding: Buffer
  dimensions: number
  created_at: number
  last_used_at: number
}

type KnowledgebaseStatsRow = {
  documentCount: number
  indexedDocumentCount: number
  chunkCount: number
}

class KnowledgebaseDao {
  private readonly db: Database.Database
  private readonly stmts: {
    upsertDocument: Database.Statement
    getAllDocuments: Database.Statement
    listDocumentPaths: Database.Statement
    getDocumentByFilePath: Database.Statement
    deleteDocumentByFilePath: Database.Statement
    clearAllDocuments: Database.Statement
    getStats: Database.Statement
    getLastIndexedAt: Database.Statement
    insertChunk: Database.Statement
    listChunkIdsByDocumentId: Database.Statement
    deleteChunksByDocumentId: Database.Statement
    clearAllChunks: Database.Statement
    upsertChunkVector: Database.Statement
    deleteChunkVectorByChunkId: Database.Statement
    clearAllChunkVectors: Database.Statement
    upsertEmbeddingCache: Database.Statement
    touchEmbeddingCache: Database.Statement
    clearEmbeddingCache: Database.Statement
  }
  private readonly searchBaseSql = `
    SELECT
      c.id,
      c.document_id,
      c.chunk_index,
      c.text,
      c.char_start,
      c.char_end,
      c.token_estimate,
      c.chunk_hash,
      c.metadata_json,
      d.file_path,
      d.file_name,
      d.ext,
      d.folder_path,
      vec_distance_cosine(v.embedding, ?) as distance
    FROM vec_knowledgebase_chunks v
    JOIN knowledgebase_chunks c ON c.id = v.chunk_id
    JOIN knowledgebase_documents d ON d.id = c.document_id
    WHERE d.status = 'indexed'
  `

  constructor(db: Database.Database) {
    this.db = db
    this.stmts = {
      upsertDocument: db.prepare(`
        INSERT OR REPLACE INTO knowledgebase_documents (
          id, folder_path, file_path, file_name, ext, size, mtime_ms, content_hash,
          status, error, chunk_count, updated_at, last_indexed_at
        ) VALUES (
          @id, @folder_path, @file_path, @file_name, @ext, @size, @mtime_ms, @content_hash,
          @status, @error, @chunk_count, @updated_at, @last_indexed_at
        )
      `),
      getAllDocuments: db.prepare(`
        SELECT * FROM knowledgebase_documents ORDER BY file_path ASC
      `),
      listDocumentPaths: db.prepare(`
        SELECT file_path FROM knowledgebase_documents
      `),
      getDocumentByFilePath: db.prepare(`
        SELECT * FROM knowledgebase_documents WHERE file_path = ?
      `),
      deleteDocumentByFilePath: db.prepare(`
        DELETE FROM knowledgebase_documents WHERE file_path = ?
      `),
      clearAllDocuments: db.prepare(`
        DELETE FROM knowledgebase_documents
      `),
      getStats: db.prepare(`
        SELECT
          COUNT(*) as documentCount,
          SUM(CASE WHEN status = 'indexed' THEN 1 ELSE 0 END) as indexedDocumentCount,
          COALESCE(SUM(chunk_count), 0) as chunkCount
        FROM knowledgebase_documents
      `),
      getLastIndexedAt: db.prepare(`
        SELECT MAX(last_indexed_at) as lastIndexedAt
        FROM knowledgebase_documents
        WHERE status = 'indexed'
      `),
      insertChunk: db.prepare(`
        INSERT INTO knowledgebase_chunks (
          id, document_id, chunk_index, text, char_start, char_end, token_estimate, chunk_hash, metadata_json
        ) VALUES (
          @id, @document_id, @chunk_index, @text, @char_start, @char_end, @token_estimate, @chunk_hash, @metadata_json
        )
      `),
      listChunkIdsByDocumentId: db.prepare(`
        SELECT id FROM knowledgebase_chunks WHERE document_id = ?
      `),
      deleteChunksByDocumentId: db.prepare(`
        DELETE FROM knowledgebase_chunks WHERE document_id = ?
      `),
      clearAllChunks: db.prepare(`
        DELETE FROM knowledgebase_chunks
      `),
      upsertChunkVector: db.prepare(`
        INSERT OR REPLACE INTO vec_knowledgebase_chunks (chunk_id, embedding) VALUES (?, ?)
      `),
      deleteChunkVectorByChunkId: db.prepare(`
        DELETE FROM vec_knowledgebase_chunks WHERE chunk_id = ?
      `),
      clearAllChunkVectors: db.prepare(`
        DELETE FROM vec_knowledgebase_chunks
      `),
      upsertEmbeddingCache: db.prepare(`
        INSERT INTO knowledgebase_embedding_cache (
          cache_key, model, strategy_version, chunk_hash, embedding, dimensions, created_at, last_used_at
        ) VALUES (
          @cache_key, @model, @strategy_version, @chunk_hash, @embedding, @dimensions, @created_at, @last_used_at
        )
        ON CONFLICT(cache_key) DO UPDATE SET
          embedding = excluded.embedding,
          dimensions = excluded.dimensions,
          last_used_at = excluded.last_used_at
      `),
      touchEmbeddingCache: db.prepare(`
        UPDATE knowledgebase_embedding_cache SET last_used_at = ? WHERE cache_key = ?
      `),
      clearEmbeddingCache: db.prepare(`
        DELETE FROM knowledgebase_embedding_cache
      `)
    }
  }

  upsertDocument(row: KnowledgebaseDocumentRow): void {
    this.stmts.upsertDocument.run(row)
  }

  getAllDocuments(): KnowledgebaseDocumentRow[] {
    return this.stmts.getAllDocuments.all() as KnowledgebaseDocumentRow[]
  }

  listDocumentPaths(): string[] {
    return (this.stmts.listDocumentPaths.all() as Array<{ file_path: string }>).map(row => row.file_path)
  }

  getDocumentByFilePath(filePath: string): KnowledgebaseDocumentRow | undefined {
    return this.stmts.getDocumentByFilePath.get(filePath) as KnowledgebaseDocumentRow | undefined
  }

  deleteDocumentByFilePath(filePath: string): void {
    this.stmts.deleteDocumentByFilePath.run(filePath)
  }

  clearAllDocuments(): void {
    this.stmts.clearAllDocuments.run()
  }

  getStats(): KnowledgebaseStatsRow {
    return this.stmts.getStats.get() as KnowledgebaseStatsRow
  }

  getLastIndexedAt(): number | undefined {
    const row = this.stmts.getLastIndexedAt.get() as { lastIndexedAt: number | null }
    return row.lastIndexedAt ?? undefined
  }

  insertChunk(row: KnowledgebaseChunkRow): void {
    this.stmts.insertChunk.run(row)
  }

  listChunkIdsByDocumentId(documentId: string): string[] {
    return (this.stmts.listChunkIdsByDocumentId.all(documentId) as Array<{ id: string }>).map(row => row.id)
  }

  deleteChunksByDocumentId(documentId: string): void {
    this.stmts.deleteChunksByDocumentId.run(documentId)
  }

  clearAllChunks(): void {
    this.stmts.clearAllChunks.run()
  }

  upsertChunkVector(chunkId: string, embedding: Buffer): void {
    this.stmts.upsertChunkVector.run(chunkId, embedding)
  }

  deleteChunkVectorByChunkId(chunkId: string): void {
    this.stmts.deleteChunkVectorByChunkId.run(chunkId)
  }

  clearAllChunkVectors(): void {
    this.stmts.clearAllChunkVectors.run()
  }

  getEmbeddingCacheByKeys(cacheKeys: string[]): KnowledgebaseEmbeddingCacheRow[] {
    if (cacheKeys.length === 0) {
      return []
    }

    const placeholders = cacheKeys.map(() => '?').join(', ')
    return this.db.prepare(`
      SELECT *
      FROM knowledgebase_embedding_cache
      WHERE cache_key IN (${placeholders})
    `).all(...cacheKeys) as KnowledgebaseEmbeddingCacheRow[]
  }

  upsertEmbeddingCache(row: KnowledgebaseEmbeddingCacheRow): void {
    this.stmts.upsertEmbeddingCache.run(row)
  }

  touchEmbeddingCache(cacheKey: string, lastUsedAt: number): void {
    this.stmts.touchEmbeddingCache.run(lastUsedAt, cacheKey)
  }

  clearEmbeddingCache(): void {
    this.stmts.clearEmbeddingCache.run()
  }

  search(
    queryBuffer: Buffer,
    options: {
      topK: number
      folders?: string[]
      extensions?: string[]
    }
  ): KnowledgebaseChunkSearchRow[] {
    const clauses: string[] = []
    const params: Array<Buffer | string | number> = [queryBuffer]

    if (options.folders && options.folders.length > 0) {
      clauses.push(`d.folder_path IN (${options.folders.map(() => '?').join(', ')})`)
      params.push(...options.folders)
    }

    if (options.extensions && options.extensions.length > 0) {
      clauses.push(`d.ext IN (${options.extensions.map(() => '?').join(', ')})`)
      params.push(...options.extensions)
    }

    const whereSql = clauses.length > 0 ? ` AND ${clauses.join(' AND ')}` : ''
    const sql = `${this.searchBaseSql}${whereSql} ORDER BY distance ASC LIMIT ?`
    params.push(options.topK)

    return this.db.prepare(sql).all(...params) as KnowledgebaseChunkSearchRow[]
  }
}

export { KnowledgebaseDao }

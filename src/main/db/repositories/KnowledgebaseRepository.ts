import type Database from 'better-sqlite3'
import type {
  KnowledgebaseDao,
  KnowledgebaseChunkRow,
  KnowledgebaseChunkSearchRow,
  KnowledgebaseDocumentRow,
  KnowledgebaseEmbeddingCacheRow
} from '@main/db/dao/KnowledgebaseDao'

type KnowledgebaseRepositoryDeps = {
  hasDb: () => boolean
  getDb: () => Database.Database | null
  getKnowledgebaseDao: () => KnowledgebaseDao | undefined
}

export class KnowledgebaseRepository {
  constructor(private readonly deps: KnowledgebaseRepositoryDeps) {}

  saveDocumentWithChunks(
    document: KnowledgebaseDocumentRow,
    chunks: Array<{ row: KnowledgebaseChunkRow; embedding: Buffer }>
  ): void {
    const dao = this.requireKnowledgebaseDao()
    const tx = this.requireDb().transaction(() => {
      dao.upsertDocument(document)
      this.deleteVectorsByDocumentId(document.id)
      dao.deleteChunksByDocumentId(document.id)
      chunks.forEach(({ row, embedding }) => {
        dao.insertChunk(row)
        dao.upsertChunkVector(row.id, embedding)
      })
    })

    tx()
  }

  saveErroredDocument(document: KnowledgebaseDocumentRow): void {
    const dao = this.requireKnowledgebaseDao()
    const tx = this.requireDb().transaction(() => {
      dao.upsertDocument(document)
      this.deleteVectorsByDocumentId(document.id)
      dao.deleteChunksByDocumentId(document.id)
    })

    tx()
  }

  deleteDocumentByPath(filePath: string): void {
    const dao = this.requireKnowledgebaseDao()
    const document = dao.getDocumentByFilePath(filePath)
    if (!document) {
      return
    }

    const tx = this.requireDb().transaction(() => {
      this.deleteVectorsByDocumentId(document.id)
      dao.deleteChunksByDocumentId(document.id)
      dao.deleteDocumentByFilePath(filePath)
    })

    tx()
  }

  listDocuments(): KnowledgebaseDocumentRow[] {
    return this.requireKnowledgebaseDao().getAllDocuments()
  }

  listDocumentPaths(): string[] {
    return this.requireKnowledgebaseDao().listDocumentPaths()
  }

  clear(): void {
    const dao = this.requireKnowledgebaseDao()
    const tx = this.requireDb().transaction(() => {
      dao.clearAllChunkVectors()
      dao.clearAllChunks()
      dao.clearAllDocuments()
      dao.clearEmbeddingCache()
    })

    tx()
  }

  getEmbeddingCacheByKeys(cacheKeys: string[]): Map<string, KnowledgebaseEmbeddingCacheRow> {
    const dao = this.requireKnowledgebaseDao()
    const rows = dao.getEmbeddingCacheByKeys([...new Set(cacheKeys)])
    const now = Date.now()

    const tx = this.requireDb().transaction(() => {
      rows.forEach((row) => {
        dao.touchEmbeddingCache(row.cache_key, now)
      })
    })
    tx()

    return new Map(rows.map(row => [row.cache_key, row]))
  }

  upsertEmbeddingCacheEntries(entries: KnowledgebaseEmbeddingCacheRow[]): void {
    if (entries.length === 0) {
      return
    }

    const dao = this.requireKnowledgebaseDao()
    const tx = this.requireDb().transaction(() => {
      entries.forEach((entry) => {
        dao.upsertEmbeddingCache(entry)
      })
    })

    tx()
  }

  getStats(): {
    documentCount: number
    indexedDocumentCount: number
    chunkCount: number
    lastIndexedAt?: number
  } {
    const dao = this.requireKnowledgebaseDao()
    const base = dao.getStats()

    return {
      documentCount: base.documentCount ?? 0,
      indexedDocumentCount: base.indexedDocumentCount ?? 0,
      chunkCount: base.chunkCount ?? 0,
      lastIndexedAt: dao.getLastIndexedAt()
    }
  }

  search(
    queryBuffer: Buffer,
    options: {
      topK: number
      folders?: string[]
      extensions?: string[]
    }
  ): KnowledgebaseChunkSearchRow[] {
    return this.requireKnowledgebaseDao().search(queryBuffer, options)
  }

  private deleteVectorsByDocumentId(documentId: string): void {
    const dao = this.requireKnowledgebaseDao()
    const chunkIds = dao.listChunkIdsByDocumentId(documentId)
    chunkIds.forEach((chunkId) => {
      dao.deleteChunkVectorByChunkId(chunkId)
    })
  }

  private requireDb(): NonNullable<ReturnType<KnowledgebaseRepositoryDeps['getDb']>> {
    if (!this.deps.hasDb()) {
      throw new Error('Knowledgebase database not initialized')
    }
    const db = this.deps.getDb()
    if (!db) {
      throw new Error('Knowledgebase database handle not initialized')
    }
    return db
  }

  private requireKnowledgebaseDao(): KnowledgebaseDao {
    if (!this.deps.hasDb()) {
      throw new Error('Knowledgebase database not initialized')
    }
    const dao = this.deps.getKnowledgebaseDao()
    if (!dao) {
      throw new Error('Knowledgebase DAO not initialized')
    }
    return dao
  }
}

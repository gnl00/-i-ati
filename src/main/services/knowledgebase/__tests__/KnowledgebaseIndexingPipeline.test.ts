import { describe, expect, it, vi } from 'vitest'
import { embedPreparedDocuments } from '../indexing/KnowledgebaseIndexingPipeline'

const embeddingInput = {
  embeddingModel: 'test-model',
  strategyVersion: 'test-strategy-v1',
  dimensions: 3
}

describe('KnowledgebaseIndexingPipeline', () => {
  it('按批次数量与字符预算拆分 embedding 请求', async () => {
    const generateBatchEmbeddings = vi.fn(async (texts: string[]) => ({
      embeddings: texts.map((_, index) => [index + 1, index + 2, index + 3])
    }))

    const documents = [
      {
        file: {
          folderPath: '/kb',
          filePath: '/kb/a.md',
          fileName: 'a.md',
          ext: '.md',
          size: 1,
          mtimeMs: 1
        },
        document: {
          id: 'doc-a',
          folder_path: '/kb',
          file_path: '/kb/a.md',
          file_name: 'a.md',
          ext: '.md',
          size: 1,
          mtime_ms: 1,
          content_hash: 'hash-a',
          status: 'indexed' as const,
          error: null,
          chunk_count: 3,
          updated_at: 1,
          last_indexed_at: 1
        },
        chunks: [
          {
            documentId: 'doc-a',
            text: 'a'.repeat(6000),
            row: {
              id: 'chunk-1',
              document_id: 'doc-a',
              chunk_index: 0,
              text: 'a'.repeat(6000),
              char_start: 0,
              char_end: 6000,
              token_estimate: 1000,
              chunk_hash: 'hash-1',
              metadata_json: '{}'
            }
          },
          {
            documentId: 'doc-a',
            text: 'b'.repeat(6000),
            row: {
              id: 'chunk-2',
              document_id: 'doc-a',
              chunk_index: 1,
              text: 'b'.repeat(6000),
              char_start: 6000,
              char_end: 12000,
              token_estimate: 1000,
              chunk_hash: 'hash-2',
              metadata_json: '{}'
            }
          },
          {
            documentId: 'doc-a',
            text: 'c'.repeat(6000),
            row: {
              id: 'chunk-3',
              document_id: 'doc-a',
              chunk_index: 2,
              text: 'c'.repeat(6000),
              char_start: 12000,
              char_end: 18000,
              token_estimate: 1000,
              chunk_hash: 'hash-3',
              metadata_json: '{}'
            }
          }
        ]
      }
    ]

    const batchEvents: Array<{ batchSize: number; batchChars: number }> = []

    const { embeddedByDocumentId, stats } = await embedPreparedDocuments({
      documents,
      embeddingService: {
        generateBatchEmbeddings
      },
      ...embeddingInput,
      embeddingBatchSize: 2,
      embeddingBatchCharBudget: 12000,
      onBatchEmbedded: ({ batchSize, batchChars }) => {
        batchEvents.push({ batchSize, batchChars })
      }
    })

    expect(generateBatchEmbeddings).toHaveBeenCalledTimes(2)
    expect(generateBatchEmbeddings).toHaveBeenNthCalledWith(
      1,
      ['a'.repeat(6000), 'b'.repeat(6000)],
      { batchSize: 2 }
    )
    expect(generateBatchEmbeddings).toHaveBeenNthCalledWith(
      2,
      ['c'.repeat(6000)],
      { batchSize: 1 }
    )
    expect(batchEvents).toEqual([
      { batchSize: 2, batchChars: 12000 },
      { batchSize: 1, batchChars: 6000 }
    ])
    expect(embeddedByDocumentId.get('doc-a')).toHaveLength(3)
    expect(stats).toEqual({
      cacheHits: 0,
      cacheMisses: 3,
      cacheHitRate: 0,
      embeddedChunks: 3,
      cacheWrites: 0,
      batchCount: 2
    })
  })

  it('复用 cache 命中的 embedding 并只生成 miss 的 chunk', async () => {
    const cachedEmbedding = Buffer.from(new Float32Array([9, 9, 9]).buffer)
    const generateBatchEmbeddings = vi.fn(async (texts: string[]) => ({
      embeddings: texts.map(() => [1, 2, 3])
    }))
    const upsertEmbeddingCacheEntries = vi.fn()

    const documents = [{
      file: {
        folderPath: '/kb',
        filePath: '/kb/a.md',
        fileName: 'a.md',
        ext: '.md',
        size: 1,
        mtimeMs: 1
      },
      document: {
        id: 'doc-a',
        folder_path: '/kb',
        file_path: '/kb/a.md',
        file_name: 'a.md',
        ext: '.md',
        size: 1,
        mtime_ms: 1,
        content_hash: 'hash-a',
        status: 'indexed' as const,
        error: null,
        chunk_count: 2,
        updated_at: 1,
        last_indexed_at: 1
      },
      chunks: [
        {
          documentId: 'doc-a',
          text: 'cached text',
          row: {
            id: 'chunk-1',
            document_id: 'doc-a',
            chunk_index: 0,
            text: 'cached text',
            char_start: 0,
            char_end: 11,
            token_estimate: 3,
            chunk_hash: 'hash-cached',
            metadata_json: '{}'
          }
        },
        {
          documentId: 'doc-a',
          text: 'miss text',
          row: {
            id: 'chunk-2',
            document_id: 'doc-a',
            chunk_index: 1,
            text: 'miss text',
            char_start: 11,
            char_end: 20,
            token_estimate: 3,
            chunk_hash: 'hash-miss',
            metadata_json: '{}'
          }
        }
      ]
    }]

    const { embeddedByDocumentId, stats } = await embedPreparedDocuments({
      documents,
      embeddingService: {
        generateBatchEmbeddings
      },
      embeddingCache: {
        getEmbeddingCacheByKeys: (cacheKeys) => new Map([
          [cacheKeys[0]!, {
            cache_key: cacheKeys[0]!,
            embedding: cachedEmbedding
          }]
        ]),
        upsertEmbeddingCacheEntries
      },
      ...embeddingInput,
      embeddingBatchSize: 2,
      embeddingBatchCharBudget: 12000
    })

    expect(generateBatchEmbeddings).toHaveBeenCalledTimes(1)
    expect(generateBatchEmbeddings).toHaveBeenCalledWith(['miss text'], { batchSize: 1 })
    expect(upsertEmbeddingCacheEntries).toHaveBeenCalledTimes(1)
    expect(upsertEmbeddingCacheEntries.mock.calls[0]?.[0]).toHaveLength(1)
    expect(embeddedByDocumentId.get('doc-a')?.map(item => item.row.id)).toEqual([
      'chunk-1',
      'chunk-2'
    ])
    expect(embeddedByDocumentId.get('doc-a')?.[0]?.embedding).toBe(cachedEmbedding)
    expect(stats).toEqual({
      cacheHits: 1,
      cacheMisses: 1,
      cacheHitRate: 0.5,
      embeddedChunks: 1,
      cacheWrites: 1,
      batchCount: 1
    })
  })
})

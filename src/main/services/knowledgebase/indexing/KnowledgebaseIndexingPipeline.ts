import crypto from 'crypto'
import fs from 'fs/promises'
import type {
  KnowledgebaseChunkRow,
  KnowledgebaseDocumentRow,
  KnowledgebaseEmbeddingCacheRow
} from '@main/db/dao/KnowledgebaseDao'
import { resolveIndexStrategy } from '../index-strategies'
import type {
  KnowledgebaseChunkCandidate,
  KnowledgebaseIndexableFile
} from '../types'

const DEFAULT_FILE_PREPARE_CONCURRENCY = 6
const DEFAULT_GLOBAL_EMBEDDING_BATCH_SIZE = 24
const DEFAULT_GLOBAL_EMBEDDING_BATCH_CHAR_BUDGET = 12000

type EmbeddingServiceLike = {
  generateBatchEmbeddings: (texts: string[], options?: { batchSize?: number }) => Promise<{ embeddings: number[][] }>
}

type EmbeddingCacheLike = {
  getEmbeddingCacheByKeys: (cacheKeys: string[]) => Map<string, Pick<KnowledgebaseEmbeddingCacheRow, 'cache_key' | 'embedding'>>
  upsertEmbeddingCacheEntries: (entries: KnowledgebaseEmbeddingCacheRow[]) => void
}

type ExistingDocumentRecord = {
  file_path: string
  status: 'indexed' | 'error' | 'skipped'
  content_hash: string
  mtime_ms: number
  size: number
  chunk_count: number
}

type PreparedChunkTask = {
  documentId: string
  row: KnowledgebaseChunkRow
  text: string
}

type PreparedChunkEmbeddingTask = PreparedChunkTask & {
  cacheKey: string
}

type PreparedChunkBatch<T extends PreparedChunkTask = PreparedChunkTask> = {
  tasks: T[]
  totalChars: number
}

type ReadyDocumentTask = {
  file: KnowledgebaseIndexableFile
  document: KnowledgebaseDocumentRow
  chunks: PreparedChunkTask[]
}

type EmptyDocumentTask = {
  document: KnowledgebaseDocumentRow
}

type ErroredDocumentTask = {
  document: KnowledgebaseDocumentRow
}

type UnchangedDocumentTask = {
  existingChunkCount: number
}

type PreparedFileTask =
  | { kind: 'ready'; task: ReadyDocumentTask }
  | { kind: 'empty'; task: EmptyDocumentTask }
  | { kind: 'error'; task: ErroredDocumentTask }
  | { kind: 'unchanged'; task: UnchangedDocumentTask }

export type PreparedIndexingPlan = {
  readyDocuments: ReadyDocumentTask[]
  emptyDocuments: EmptyDocumentTask[]
  erroredDocuments: ErroredDocumentTask[]
  unchangedFiles: number
  unchangedChunks: number
  totalChunks: number
}

export type EmbeddedDocumentChunks = Map<string, Array<{ row: KnowledgebaseChunkRow; embedding: Buffer }>>

export type EmbeddingCacheStats = {
  cacheHits: number
  cacheMisses: number
  cacheHitRate: number
  embeddedChunks: number
  cacheWrites: number
  batchCount: number
}

function splitChunkTasksIntoBatches<T extends PreparedChunkTask>(
  chunkTasks: T[],
  maxBatchSize: number,
  maxBatchChars: number
): Array<PreparedChunkBatch<T>> {
  if (chunkTasks.length === 0) {
    return []
  }

  const safeBatchSize = Math.max(maxBatchSize, 1)
  const safeBatchChars = Math.max(maxBatchChars, 1)
  const batches: Array<PreparedChunkBatch<T>> = []
  let currentTasks: T[] = []
  let currentChars = 0

  const flush = () => {
    if (currentTasks.length === 0) {
      return
    }
    batches.push({
      tasks: currentTasks,
      totalChars: currentChars
    })
    currentTasks = []
    currentChars = 0
  }

  chunkTasks.forEach((task) => {
    const textLength = Math.max(task.text.length, 1)
    const exceedsBatchSize = currentTasks.length >= safeBatchSize
    const exceedsCharBudget = currentTasks.length > 0
      && currentChars + textLength > safeBatchChars

    if (exceedsBatchSize || exceedsCharBudget) {
      flush()
    }

    currentTasks.push(task)
    currentChars += textLength
  })

  flush()
  return batches
}

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex')
}

function createEmbeddingCacheKey(input: {
  model: string
  strategyVersion: string
  chunkHash: string
}): string {
  return sha256([
    input.model,
    input.strategyVersion,
    input.chunkHash
  ].join('\0'))
}

function toChunkRow(
  chunk: KnowledgebaseChunkCandidate,
  documentId: string,
  sharedMetadata: Record<string, unknown>
): KnowledgebaseChunkRow {
  return {
    id: crypto.randomUUID(),
    document_id: documentId,
    chunk_index: chunk.chunkIndex,
    text: chunk.text,
    char_start: chunk.charStart,
    char_end: chunk.charEnd,
    token_estimate: chunk.tokenEstimate,
    chunk_hash: sha256(chunk.text),
    metadata_json: JSON.stringify({
      ...sharedMetadata,
      ...(chunk.metadata ?? {})
    })
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) {
    return []
  }

  const results = new Array<R>(items.length)
  let cursor = 0
  const workerCount = Math.min(Math.max(concurrency, 1), items.length)

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (true) {
      const currentIndex = cursor
      cursor += 1
      if (currentIndex >= items.length) {
        return
      }
      results[currentIndex] = await worker(items[currentIndex]!, currentIndex)
    }
  }))

  return results
}

export async function prepareIndexingPlan(input: {
  files: KnowledgebaseIndexableFile[]
  existingByPath: Map<string, ExistingDocumentRecord>
  chunkSize: number
  chunkOverlap: number
  force: boolean
  filePrepareConcurrency?: number
  onFilePrepared?: (event: {
    file: KnowledgebaseIndexableFile
    kind: PreparedFileTask['kind']
    chunkCount: number
  }) => void
}): Promise<PreparedIndexingPlan> {
  const preparedFiles = await mapWithConcurrency(
    input.files,
    input.filePrepareConcurrency ?? DEFAULT_FILE_PREPARE_CONCURRENCY,
    async (file): Promise<PreparedFileTask> => {
      try {
        const rawText = await fs.readFile(file.filePath, 'utf8')
        const indexStrategy = resolveIndexStrategy(file)
        const preparedDocument = indexStrategy.prepare({
          file,
          rawText,
          chunkSize: input.chunkSize,
          chunkOverlap: input.chunkOverlap
        })

        const normalizedText = preparedDocument.normalizedText
        const contentHash = sha256(normalizedText)
        const documentId = sha256(file.filePath)
        const existing = input.existingByPath.get(file.filePath)

        if (!input.force
          && existing
          && existing.status === 'indexed'
          && existing.content_hash === contentHash
          && existing.mtime_ms === file.mtimeMs
          && existing.size === file.size
        ) {
          const task: PreparedFileTask = {
            kind: 'unchanged',
            task: {
              existingChunkCount: existing.chunk_count
            }
          }
          input.onFilePrepared?.({
            file,
            kind: task.kind,
            chunkCount: existing.chunk_count
          })
          return task
        }

        const chunks = preparedDocument.chunks

        if (chunks.length === 0) {
          const task: PreparedFileTask = {
            kind: 'empty',
            task: {
              document: {
                id: documentId,
                folder_path: file.folderPath,
                file_path: file.filePath,
                file_name: file.fileName,
                ext: file.ext,
                size: file.size,
                mtime_ms: file.mtimeMs,
                content_hash: contentHash,
                status: 'skipped',
                error: null,
                chunk_count: 0,
                updated_at: Date.now(),
                last_indexed_at: Date.now()
              }
            }
          }
          input.onFilePrepared?.({
            file,
            kind: task.kind,
            chunkCount: 0
          })
          return task
        }

        const now = Date.now()
        const document: KnowledgebaseDocumentRow = {
          id: documentId,
          folder_path: file.folderPath,
          file_path: file.filePath,
          file_name: file.fileName,
          ext: file.ext,
          size: file.size,
          mtime_ms: file.mtimeMs,
          content_hash: contentHash,
          status: 'indexed',
          error: null,
          chunk_count: chunks.length,
          updated_at: now,
          last_indexed_at: now
        }

        const task: PreparedFileTask = {
          kind: 'ready',
          task: {
            file,
            document,
            chunks: chunks.map((chunk) => ({
              documentId,
              text: chunk.text,
              row: toChunkRow(chunk, documentId, preparedDocument.sharedMetadata)
            }))
          }
        }
        input.onFilePrepared?.({
          file,
          kind: task.kind,
          chunkCount: chunks.length
        })
        return task
      } catch (error) {
        const task: PreparedFileTask = {
          kind: 'error',
          task: {
            document: {
              id: sha256(file.filePath),
              folder_path: file.folderPath,
              file_path: file.filePath,
              file_name: file.fileName,
              ext: file.ext,
              size: file.size,
              mtime_ms: file.mtimeMs,
              content_hash: '',
              status: 'error',
              error: error instanceof Error ? error.message : String(error),
              chunk_count: 0,
              updated_at: Date.now(),
              last_indexed_at: null
            }
          }
        }
        input.onFilePrepared?.({
          file,
          kind: task.kind,
          chunkCount: 0
        })
        return task
      }
    }
  )

  const plan: PreparedIndexingPlan = {
    readyDocuments: [],
    emptyDocuments: [],
    erroredDocuments: [],
    unchangedFiles: 0,
    unchangedChunks: 0,
    totalChunks: 0
  }

  preparedFiles.forEach((prepared) => {
    if (prepared.kind === 'ready') {
      plan.readyDocuments.push(prepared.task)
      plan.totalChunks += prepared.task.chunks.length
      return
    }
    if (prepared.kind === 'empty') {
      plan.emptyDocuments.push(prepared.task)
      return
    }
    if (prepared.kind === 'error') {
      plan.erroredDocuments.push(prepared.task)
      return
    }

    plan.unchangedFiles += 1
    plan.unchangedChunks += prepared.task.existingChunkCount
    plan.totalChunks += prepared.task.existingChunkCount
  })

  return plan
}

export async function embedPreparedDocuments(input: {
  documents: ReadyDocumentTask[]
  embeddingService: EmbeddingServiceLike
  embeddingCache?: EmbeddingCacheLike
  embeddingModel: string
  strategyVersion: string
  dimensions: number
  embeddingBatchSize?: number
  embeddingBatchCharBudget?: number
  onBatchEmbedded?: (event: {
    batchSize: number
    batchChars: number
    processedChunks: number
    totalChunks: number
  }) => void
}): Promise<{
  embeddedByDocumentId: EmbeddedDocumentChunks
  stats: EmbeddingCacheStats
}> {
  const batchSize = input.embeddingBatchSize ?? DEFAULT_GLOBAL_EMBEDDING_BATCH_SIZE
  const batchCharBudget = input.embeddingBatchCharBudget ?? DEFAULT_GLOBAL_EMBEDDING_BATCH_CHAR_BUDGET
  const chunkTasks = input.documents.flatMap(document => document.chunks.map((task): PreparedChunkEmbeddingTask => ({
    ...task,
    cacheKey: createEmbeddingCacheKey({
      model: input.embeddingModel,
      strategyVersion: input.strategyVersion,
      chunkHash: task.row.chunk_hash
    })
  })))
  const embeddedByDocumentId: EmbeddedDocumentChunks = new Map()
  const stats: EmbeddingCacheStats = {
    cacheHits: 0,
    cacheMisses: 0,
    cacheHitRate: 0,
    embeddedChunks: 0,
    cacheWrites: 0,
    batchCount: 0
  }

  if (chunkTasks.length === 0) {
    return {
      embeddedByDocumentId,
      stats
    }
  }

  const appendEmbedding = (task: PreparedChunkTask, embedding: Buffer): void => {
    const rows = embeddedByDocumentId.get(task.documentId) ?? []
    rows.push({
      row: task.row,
      embedding
    })
    embeddedByDocumentId.set(task.documentId, rows)
  }

  const cachedEntries = input.embeddingCache?.getEmbeddingCacheByKeys(
    chunkTasks.map(task => task.cacheKey)
  ) ?? new Map<string, Pick<KnowledgebaseEmbeddingCacheRow, 'cache_key' | 'embedding'>>()

  const missedTasks: PreparedChunkEmbeddingTask[] = []
  chunkTasks.forEach((task) => {
    const cached = cachedEntries.get(task.cacheKey)
    if (cached) {
      appendEmbedding(task, cached.embedding)
      stats.cacheHits += 1
      return
    }

    missedTasks.push(task)
  })

  stats.cacheMisses = missedTasks.length
  stats.cacheHitRate = Number((stats.cacheHits / chunkTasks.length).toFixed(4))

  let processedChunks = stats.cacheHits
  const batches = splitChunkTasksIntoBatches(missedTasks, batchSize, batchCharBudget)

  for (const batch of batches) {
    const batchTasks = batch.tasks
    const { embeddings } = await input.embeddingService.generateBatchEmbeddings(
      batchTasks.map(task => task.text),
      { batchSize: batchTasks.length }
    )

    batchTasks.forEach((task, index) => {
      const vector = new Float32Array(embeddings[index]!)
      appendEmbedding(
        task,
        Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength)
      )
    })

    const cacheEntries = batchTasks.map((task, index) => {
      const vector = new Float32Array(embeddings[index]!)
      const now = Date.now()
      return {
        cache_key: task.cacheKey,
        model: input.embeddingModel,
        strategy_version: input.strategyVersion,
        chunk_hash: task.row.chunk_hash,
        embedding: Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength),
        dimensions: input.dimensions,
        created_at: now,
        last_used_at: now
      }
    })
    input.embeddingCache?.upsertEmbeddingCacheEntries(cacheEntries)

    processedChunks += batchTasks.length
    stats.embeddedChunks += batchTasks.length
    stats.cacheWrites += input.embeddingCache ? cacheEntries.length : 0
    stats.batchCount += 1
    input.onBatchEmbedded?.({
      batchSize: batchTasks.length,
      batchChars: batch.totalChars,
      processedChunks,
      totalChunks: chunkTasks.length
    })
  }

  embeddedByDocumentId.forEach((rows) => {
    rows.sort((a, b) => a.row.chunk_index - b.row.chunk_index)
  })

  return {
    embeddedByDocumentId,
    stats
  }
}

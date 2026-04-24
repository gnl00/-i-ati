import { AppConfigStore } from '@main/hosts/chat/config/AppConfigStore'
import { createLogger } from '@main/logging/LogService'
import EmbeddingServiceInstance from '@main/services/embedding/EmbeddingService'
import { bootstrapKnowledgebaseDb } from '@main/db/core/Database'
import { loadSqliteVecExtension } from '@main/db/sqlite/loadSqliteVec'
import { app } from 'electron'
import Database from 'better-sqlite3'
import fs from 'fs/promises'
import path from 'path'
import { KnowledgebaseDao } from '@main/db/dao/KnowledgebaseDao'
import { KnowledgebaseRepository } from '@main/db/repositories/KnowledgebaseRepository'
import {
  embedPreparedDocuments,
  prepareIndexingPlan
} from './indexing/KnowledgebaseIndexingPipeline'
import { computeSearchRankingSignals } from './ranking'
import type {
  KnowledgebaseChunkMetadata,
  KnowledgebaseIndexableFile,
  KnowledgebaseIndexStatus,
  KnowledgebaseSearchOptions,
  KnowledgebaseStats
} from './types'

interface EmbeddingServiceLike {
  generateBatchEmbeddings: (texts: string[], options?: { batchSize?: number }) => Promise<{ embeddings: number[][] }>
  generateEmbedding: (text: string) => Promise<{ embedding: number[] }>
  getModelInfo?: () => { name: string; dimensions: number }
}

const SUPPORTED_EXTENSIONS = new Set([
  '.md', '.txt', '.json', '.log',
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.sql',
  '.yaml', '.yml', '.toml',
  '.sh', '.bash', '.zsh',
  '.css', '.scss', '.html', '.xml'
])

const IGNORED_DIRECTORIES = new Set([
  '.git', '.idea', '.vscode', 'node_modules', 'dist', 'out', 'build', '.next', '.turbo', 'coverage'
])
const FILE_PREPARE_CONCURRENCY = 6
const GLOBAL_EMBEDDING_BATCH_SIZE = 24
const GLOBAL_EMBEDDING_BATCH_CHAR_BUDGET = 12000
const KNOWLEDGEBASE_EMBEDDING_MODEL = 'all-MiniLM-L6-v2'
const KNOWLEDGEBASE_EMBEDDING_DIMENSIONS = 384
const KNOWLEDGEBASE_INDEX_STRATEGY_VERSION = 'knowledgebase-index-v2'

function nowStatus(state: KnowledgebaseIndexStatus['state'], patch?: Partial<KnowledgebaseIndexStatus>): KnowledgebaseIndexStatus {
  return {
    state,
    totalFiles: patch?.totalFiles ?? 0,
    processedFiles: patch?.processedFiles ?? 0,
    totalChunks: patch?.totalChunks ?? 0,
    processedChunks: patch?.processedChunks ?? 0,
    message: patch?.message,
    updatedAt: Date.now()
  }
}

function normalizeExtension(input: string): string {
  return input.trim().toLowerCase()
}

function normalizeFolder(input: string): string {
  return path.resolve(input)
}

function parseChunkMetadata(metadataJson: string | null | undefined): KnowledgebaseChunkMetadata | undefined {
  if (!metadataJson) {
    return undefined
  }

  try {
    const parsed = JSON.parse(metadataJson) as KnowledgebaseChunkMetadata
    return parsed && typeof parsed === 'object' ? parsed : undefined
  } catch {
    return undefined
  }
}

export class KnowledgebaseService {
  private readonly logger = createLogger('KnowledgebaseService')
  private readonly appConfigStore = new AppConfigStore()
  private readonly embeddingService: EmbeddingServiceLike
  private readonly dbPath: string
  private db: Database.Database | null = null
  private repo: KnowledgebaseRepository | null = null
  private initialized = false
  private indexingPromise: Promise<void> | null = null
  private status: KnowledgebaseIndexStatus = nowStatus('idle')

  constructor(embeddingService: EmbeddingServiceLike = EmbeddingServiceInstance) {
    this.embeddingService = embeddingService
    this.dbPath = path.join(app.getPath('userData'), 'knowledgebase.db')
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    this.logger.info('initialize.start', { dbPath: this.dbPath })
    this.db = new Database(this.dbPath)
    loadSqliteVecExtension(this.db, this.logger)
    this.db.pragma('journal_mode = WAL')
    bootstrapKnowledgebaseDb(this.db)

    const knowledgebaseDao = new KnowledgebaseDao(this.db)

    this.repo = new KnowledgebaseRepository({
      hasDb: () => Boolean(this.db),
      getDb: () => this.db,
      getKnowledgebaseDao: () => knowledgebaseDao
    })
    this.initialized = true
    this.status = nowStatus('idle')
    this.logger.info('initialize.completed')
  }

  getStatus(): KnowledgebaseIndexStatus {
    return this.status
  }

  async getStats(): Promise<KnowledgebaseStats> {
    await this.initialize()
    const repo = this.requireRepo()
    return repo.getStats()
  }

  async clear(): Promise<{ success: boolean }> {
    await this.initialize()
    this.requireRepo().clear()
    this.status = nowStatus('completed', {
      message: 'Knowledgebase cleared'
    })
    return { success: true }
  }

  async reindexFromConfig(force = false): Promise<{ success: boolean }> {
    return this.reindex({
      force
    })
  }

  async reindex(args?: {
    force?: boolean
    configOverride?: KnowledgebaseConfig
  }): Promise<{ success: boolean }> {
    await this.initialize()
    const force = Boolean(args?.force)

    if (this.indexingPromise) {
      await this.indexingPromise
      return { success: true }
    }

    this.indexingPromise = this.runReindex(force, args?.configOverride)
    try {
      await this.indexingPromise
      return { success: true }
    } finally {
      this.indexingPromise = null
    }
  }

  async search(
    query: string,
    options: KnowledgebaseSearchOptions
  ): Promise<Array<{
    chunkId: string
    documentId: string
    filePath: string
    fileName: string
    folderPath: string
    ext: string
    text: string
    chunkIndex: number
    score: number
    similarity: number
    charStart: number
    charEnd: number
    tokenEstimate: number
  }>> {
    await this.initialize()
    const trimmedQuery = query.trim()
    if (!trimmedQuery) {
      return []
    }

    const normalizedFolders = options.folders?.map(normalizeFolder)
    const normalizedExtensions = options.extensions?.map(normalizeExtension)
    const topK = Math.min(Math.max(options.topK, 1), 20)
    const oversampledTopK = Math.min(topK * 8, 120)
    const { embedding } = await this.embeddingService.generateEmbedding(trimmedQuery)
    const queryVector = new Float32Array(embedding)
    const queryBuffer = Buffer.from(queryVector.buffer, queryVector.byteOffset, queryVector.byteLength)
    const rows = this.requireRepo().search(queryBuffer, {
      topK: oversampledTopK,
      folders: normalizedFolders,
      extensions: normalizedExtensions
    })

    return rows
      .map((row) => {
        const similarity = 1 - row.distance
        const metadata = parseChunkMetadata(row.metadata_json)
        const rankingSignals = computeSearchRankingSignals({
          query: trimmedQuery,
          text: row.text,
          filePath: row.file_path,
          fileName: row.file_name,
          headingPaths: metadata?.headingPaths
        })
        const exactPhraseBoost = rankingSignals.exactTextHit ? 0.12 : 0
        const extensionBoost = normalizedExtensions?.includes(row.ext) ? 0.04 : 0
        const lowEvidencePenalty = rankingSignals.lexicalScore < 0.12 ? 0.08 : 0
        const markupPenalty = (row.ext === '.html' || row.ext === '.xml') && rankingSignals.lexicalScore < 0.25 ? 0.06 : 0
        const score = Math.max(
          0,
          Math.min(
            1,
            similarity * 0.54
              + rankingSignals.lexicalScore * 0.24
              + rankingSignals.headingScore * 0.14
              + exactPhraseBoost
              + extensionBoost
              - lowEvidencePenalty
              - markupPenalty
          )
        )
        return {
          chunkId: row.id,
          documentId: row.document_id,
          filePath: row.file_path,
          fileName: row.file_name,
          folderPath: row.folder_path,
          ext: row.ext,
          text: row.text,
          chunkIndex: row.chunk_index,
          similarity: Number(similarity.toFixed(4)),
          score: Number(score.toFixed(4)),
          charStart: row.char_start,
          charEnd: row.char_end,
          tokenEstimate: row.token_estimate
        }
      })
      .filter((item) => options.threshold === undefined || item.similarity >= options.threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  }

  private async runReindex(force: boolean, configOverride?: KnowledgebaseConfig): Promise<void> {
    const config = configOverride ?? this.appConfigStore.requireConfig().knowledgebase
    const folders = (config?.folders ?? []).map(normalizeFolder)
    const enabled = config?.enabled ?? false
    const chunkSize = config?.chunkSize ?? 1200
    const chunkOverlap = config?.chunkOverlap ?? 200

    if (!enabled || folders.length === 0) {
      this.status = nowStatus('completed', {
        message: 'Knowledgebase disabled or no folders configured'
      })
      return
    }

    const startedAt = Date.now()
    this.logger.info('reindex.started', {
      mode: force ? 'rebuild' : 'reindex',
      startedAt,
      folderCount: folders.length,
      chunkSize,
      chunkOverlap
    })

    const files = await this.collectFiles(folders)
    this.status = nowStatus('scanning', {
      totalFiles: files.length,
      processedFiles: 0,
      totalChunks: 0,
      processedChunks: 0,
      message: `Scanning ${files.length} files`
    })

    const repo = this.requireRepo()
    const existingPaths = new Set(repo.listDocumentPaths())
    const currentPaths = new Set(files.map(file => file.filePath))
    existingPaths.forEach((filePath) => {
      if (!currentPaths.has(filePath)) {
        repo.deleteDocumentByPath(filePath)
      }
    })

    const existingByPath = new Map(repo.listDocuments().map(document => [document.file_path, document]))
    let processedFiles = 0
    let processedChunks = 0
    const chunkingStartedAt = Date.now()

    this.status = nowStatus('chunking', {
      totalFiles: files.length,
      processedFiles,
      totalChunks: 0,
      processedChunks,
      message: `Preparing ${files.length} files`
    })

    const indexingPlan = await prepareIndexingPlan({
      files,
      existingByPath,
      chunkSize,
      chunkOverlap,
      force,
      filePrepareConcurrency: FILE_PREPARE_CONCURRENCY,
      onFilePrepared: ({ file, kind }) => {
        this.status = nowStatus('chunking', {
          totalFiles: files.length,
          processedFiles,
          totalChunks: 0,
          processedChunks,
          message: `Prepared ${file.fileName} (${kind})`
        })
      }
    })

    processedFiles += indexingPlan.unchangedFiles
    processedChunks += indexingPlan.unchangedChunks

    indexingPlan.emptyDocuments.forEach(({ document }) => {
      repo.saveErroredDocument(document)
      processedFiles += 1
    })

    indexingPlan.erroredDocuments.forEach(({ document }) => {
      repo.saveErroredDocument(document)
      processedFiles += 1
      this.logger.warn('reindex.file_failed', {
        filePath: document.file_path,
        error: document.error
      })
    })

    const totalChunks = indexingPlan.totalChunks
    const chunkingCompletedAt = Date.now()
    const chunkingDurationMs = chunkingCompletedAt - chunkingStartedAt
    this.logger.info('reindex.chunking_completed', {
      mode: force ? 'rebuild' : 'reindex',
      startedAt: chunkingStartedAt,
      completedAt: chunkingCompletedAt,
      durationMs: chunkingDurationMs,
      totalFiles: files.length,
      readyDocuments: indexingPlan.readyDocuments.length,
      unchangedFiles: indexingPlan.unchangedFiles,
      skippedFiles: indexingPlan.emptyDocuments.length,
      erroredFiles: indexingPlan.erroredDocuments.length,
      totalChunks
    })
    this.logger.info('reindex.plan_built', {
      mode: force ? 'rebuild' : 'reindex',
      filePrepareConcurrency: FILE_PREPARE_CONCURRENCY,
      embeddingBatchSize: GLOBAL_EMBEDDING_BATCH_SIZE,
      embeddingBatchCharBudget: GLOBAL_EMBEDDING_BATCH_CHAR_BUDGET,
      readyDocuments: indexingPlan.readyDocuments.length,
      unchangedFiles: indexingPlan.unchangedFiles,
      skippedFiles: indexingPlan.emptyDocuments.length,
      erroredFiles: indexingPlan.erroredDocuments.length,
      totalChunks
    })

    this.status = nowStatus('embedding', {
      totalFiles: files.length,
      processedFiles,
      totalChunks,
      processedChunks,
      message: `Embedding ${indexingPlan.readyDocuments.length} documents`
    })

    const embeddingModelInfo = this.embeddingService.getModelInfo?.()
    const embeddingModel = embeddingModelInfo?.name ?? KNOWLEDGEBASE_EMBEDDING_MODEL
    const embeddingDimensions = embeddingModelInfo?.dimensions ?? KNOWLEDGEBASE_EMBEDDING_DIMENSIONS
    const embeddingStartedAt = Date.now()
    const {
      embeddedByDocumentId,
      stats: embeddingStats
    } = await embedPreparedDocuments({
      documents: indexingPlan.readyDocuments,
      embeddingService: this.embeddingService,
      embeddingCache: repo,
      embeddingModel,
      strategyVersion: KNOWLEDGEBASE_INDEX_STRATEGY_VERSION,
      dimensions: embeddingDimensions,
      embeddingBatchSize: GLOBAL_EMBEDDING_BATCH_SIZE,
      embeddingBatchCharBudget: GLOBAL_EMBEDDING_BATCH_CHAR_BUDGET,
      onBatchEmbedded: ({ batchSize, batchChars, processedChunks: embeddedChunks, totalChunks: embeddingTotalChunks }) => {
        this.status = nowStatus('embedding', {
          totalFiles: files.length,
          processedFiles,
          totalChunks,
          processedChunks: processedChunks + embeddedChunks,
          message: `Embedded ${embeddedChunks}/${embeddingTotalChunks} chunks (batch ${batchSize}, chars ${batchChars})`
        })
      }
    })
    const embeddingCompletedAt = Date.now()
    const embeddingDurationMs = embeddingCompletedAt - embeddingStartedAt
    this.logger.info('reindex.embedding_completed', {
      mode: force ? 'rebuild' : 'reindex',
      startedAt: embeddingStartedAt,
      completedAt: embeddingCompletedAt,
      durationMs: embeddingDurationMs,
      readyDocuments: indexingPlan.readyDocuments.length,
      embeddedChunks: indexingPlan.readyDocuments.reduce((sum, task) => sum + task.chunks.length, 0),
      embeddingModel,
      strategyVersion: KNOWLEDGEBASE_INDEX_STRATEGY_VERSION,
      cacheHits: embeddingStats.cacheHits,
      cacheMisses: embeddingStats.cacheMisses,
      cacheHitRate: embeddingStats.cacheHitRate,
      cacheWrites: embeddingStats.cacheWrites,
      batchCount: embeddingStats.batchCount
    })

    const dbSaveStartedAt = Date.now()
    for (const task of indexingPlan.readyDocuments) {
      repo.saveDocumentWithChunks(
        task.document,
        embeddedByDocumentId.get(task.document.id) ?? []
      )
      processedFiles += 1
      processedChunks += task.chunks.length
      this.status = nowStatus('embedding', {
        totalFiles: files.length,
        processedFiles,
        totalChunks,
        processedChunks,
        message: `Indexed ${task.file.fileName}`
      })
    }
    const dbSaveCompletedAt = Date.now()
    const dbSaveDurationMs = dbSaveCompletedAt - dbSaveStartedAt
    this.logger.info('reindex.db_save_completed', {
      mode: force ? 'rebuild' : 'reindex',
      startedAt: dbSaveStartedAt,
      completedAt: dbSaveCompletedAt,
      durationMs: dbSaveDurationMs,
      savedDocuments: indexingPlan.readyDocuments.length,
      savedChunks: indexingPlan.readyDocuments.reduce((sum, task) => sum + task.chunks.length, 0)
    })

    this.status = nowStatus('completed', {
      totalFiles: files.length,
      processedFiles,
      totalChunks,
      processedChunks,
      message: force ? 'Knowledgebase rebuilt' : 'Knowledgebase indexed'
    })
    const completedAt = Date.now()
    this.logger.info('reindex.completed', {
      mode: force ? 'rebuild' : 'reindex',
      startedAt,
      completedAt,
      durationMs: completedAt - startedAt,
      chunkingDurationMs,
      embeddingDurationMs,
      dbSaveDurationMs,
      embeddingCacheHits: embeddingStats.cacheHits,
      embeddingCacheMisses: embeddingStats.cacheMisses,
      embeddingCacheHitRate: embeddingStats.cacheHitRate,
      totalFiles: files.length,
      processedFiles,
      totalChunks,
      processedChunks
    })
  }

  private async collectFiles(folders: string[]): Promise<KnowledgebaseIndexableFile[]> {
    const results: KnowledgebaseIndexableFile[] = []
    for (const folder of folders) {
      await this.walkFolder(folder, folder, results)
    }
    return results.sort((a, b) => a.filePath.localeCompare(b.filePath))
  }

  private async walkFolder(rootFolder: string, currentFolder: string, results: KnowledgebaseIndexableFile[]): Promise<void> {
    const entries = await fs.readdir(currentFolder, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.env') {
        if (entry.isDirectory()) {
          continue
        }
      }

      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) {
          continue
        }
        await this.walkFolder(rootFolder, path.join(currentFolder, entry.name), results)
        continue
      }

      if (!entry.isFile()) {
        continue
      }

      const ext = normalizeExtension(path.extname(entry.name))
      if (!SUPPORTED_EXTENSIONS.has(ext)) {
        continue
      }

      const filePath = path.join(currentFolder, entry.name)
      const stat = await fs.stat(filePath)
      results.push({
        folderPath: rootFolder,
        filePath,
        fileName: entry.name,
        ext,
        size: stat.size,
        mtimeMs: stat.mtimeMs
      })
    }
  }

  private requireRepo(): KnowledgebaseRepository {
    if (!this.repo) {
      throw new Error('Knowledgebase repository not initialized')
    }
    return this.repo
  }
}

export const knowledgebaseService = new KnowledgebaseService()

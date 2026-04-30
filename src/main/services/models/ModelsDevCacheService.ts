import { app } from 'electron'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { createLogger } from '@main/logging/LogService'
import {
  buildModelsDevCapabilityIndex,
  type GetModelCapabilitiesResponse,
  type ModelCapabilitySnapshot
} from '@shared/models/capabilities'

type ModelsDevCacheServiceOptions = {
  apiUrl?: string
  fetchImpl?: typeof fetch
  fetchTimeoutMs?: number
  getUserDataPath?: () => string
  now?: () => Date
}

type SnapshotState = {
  sourceDate: string
  index: Map<string, ModelCapabilitySnapshot>
}

const MODELS_DEV_API_URL = 'https://models.dev/api.json'
const SNAPSHOT_DIR = 'models'
const SNAPSHOT_FILE_PATTERN = /^\d{4}-\d{2}-\d{2}\.json$/
const DEFAULT_FETCH_TIMEOUT_MS = 30000

const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

const parseSnapshotDate = (fileName: string): string => {
  return fileName.replace(/\.json$/, '')
}

const uniqueModelIds = (modelIds: string[]): string[] => {
  return Array.from(new Set(
    modelIds
      .map(modelId => modelId.trim())
      .filter(Boolean)
  ))
}

export class ModelsDevCacheService {
  private readonly logger = createLogger('ModelsDevCacheService')
  private readonly apiUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly fetchTimeoutMs: number
  private readonly getUserDataPath: () => string
  private readonly now: () => Date
  private state?: SnapshotState
  private ensurePromise: Promise<SnapshotState | undefined> | null = null

  constructor(options: ModelsDevCacheServiceOptions = {}) {
    this.apiUrl = options.apiUrl ?? MODELS_DEV_API_URL
    this.fetchImpl = options.fetchImpl ?? fetch
    this.fetchTimeoutMs = options.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS
    this.getUserDataPath = options.getUserDataPath ?? (() => app.getPath('userData'))
    this.now = options.now ?? (() => new Date())
  }

  async ensureFreshSnapshot(): Promise<SnapshotState | undefined> {
    if (this.ensurePromise) {
      return this.ensurePromise
    }

    this.ensurePromise = this.ensureFreshSnapshotInternal()
      .finally(() => {
        this.ensurePromise = null
      })

    return this.ensurePromise
  }

  async getModelCapabilities(modelIds: string[]): Promise<GetModelCapabilitiesResponse> {
    await this.ensureFreshSnapshot().catch((error) => {
      this.logger.warn('snapshot.ensure_failed', error)
    })

    const models: GetModelCapabilitiesResponse['models'] = {}
    const index = this.state?.index
    const normalizedIndex = this.buildNormalizedIndex(index)

    uniqueModelIds(modelIds).forEach((modelId) => {
      models[modelId] = index?.get(modelId)
        ?? normalizedIndex.get(modelId.toLowerCase())
        ?? null
    })

    return { models }
  }

  private async ensureFreshSnapshotInternal(): Promise<SnapshotState | undefined> {
    const sourceDate = formatLocalDate(this.now())
    const snapshotPath = this.getSnapshotPath(sourceDate)

    const cached = await this.readSnapshot(snapshotPath, sourceDate)
    if (cached) {
      this.state = cached
      this.logger.info('snapshot.loaded_today', {
        sourceDate,
        models: cached.index.size
      })
      return cached
    }

    try {
      const fetched = await this.fetchSnapshot(sourceDate)
      await this.writeSnapshot(snapshotPath, fetched.raw)
      this.state = fetched.state
      this.logger.info('snapshot.fetched', {
        sourceDate,
        models: fetched.state.index.size
      })
      return fetched.state
    } catch (error) {
      this.logger.warn('snapshot.fetch_failed', error)
      const fallback = await this.readLatestSnapshot()
      if (fallback) {
        this.state = fallback
        this.logger.info('snapshot.loaded_fallback', {
          sourceDate: fallback.sourceDate,
          models: fallback.index.size
        })
      }
      return fallback
    }
  }

  private async fetchSnapshot(sourceDate: string): Promise<{ raw: string; state: SnapshotState }> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.fetchTimeoutMs)

    try {
      const response = await this.fetchImpl(this.apiUrl, {
        method: 'GET',
        signal: controller.signal
      })

      if (!response.ok) {
        throw new Error(`models.dev returned ${response.status}`)
      }

      const raw = await response.text()
      const data = JSON.parse(raw)
      const index = buildModelsDevCapabilityIndex(data, sourceDate)

      if (index.size === 0) {
        throw new Error('models.dev snapshot contains no models')
      }

      return {
        raw,
        state: {
          sourceDate,
          index
        }
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  private async readLatestSnapshot(): Promise<SnapshotState | undefined> {
    const dir = this.getSnapshotDir()

    try {
      const files = await fs.readdir(dir)
      const snapshots = files
        .filter(fileName => SNAPSHOT_FILE_PATTERN.test(fileName))
        .sort((left, right) => right.localeCompare(left))

      for (const fileName of snapshots) {
        const sourceDate = parseSnapshotDate(fileName)
        const state = await this.readSnapshot(path.join(dir, fileName), sourceDate)
        if (state) {
          return state
        }
      }
    } catch (error) {
      this.logger.debug('snapshot.latest_missing', error)
    }

    return undefined
  }

  private async readSnapshot(snapshotPath: string, sourceDate: string): Promise<SnapshotState | undefined> {
    try {
      const raw = await fs.readFile(snapshotPath, 'utf-8')
      const data = JSON.parse(raw)
      const index = buildModelsDevCapabilityIndex(data, sourceDate)
      if (index.size === 0) {
        return undefined
      }
      return { sourceDate, index }
    } catch (error) {
      this.logger.debug('snapshot.read_failed', {
        snapshotPath,
        error
      })
      return undefined
    }
  }

  private async writeSnapshot(snapshotPath: string, raw: string): Promise<void> {
    await fs.mkdir(path.dirname(snapshotPath), { recursive: true })
    const tmpPath = `${snapshotPath}.${process.pid}.${Date.now()}.tmp`
    await fs.writeFile(tmpPath, `${raw.trim()}\n`, 'utf-8')
    await fs.rename(tmpPath, snapshotPath)
  }

  private buildNormalizedIndex(
    index: Map<string, ModelCapabilitySnapshot> | undefined
  ): Map<string, ModelCapabilitySnapshot> {
    const normalized = new Map<string, ModelCapabilitySnapshot>()

    index?.forEach((snapshot, modelId) => {
      const key = modelId.toLowerCase()
      if (!normalized.has(key)) {
        normalized.set(key, snapshot)
      }
    })

    return normalized
  }

  private getSnapshotDir(): string {
    return path.join(this.getUserDataPath(), SNAPSHOT_DIR)
  }

  private getSnapshotPath(sourceDate: string): string {
    return path.join(this.getSnapshotDir(), `${sourceDate}.json`)
  }
}

export const modelsDevCacheService = new ModelsDevCacheService()

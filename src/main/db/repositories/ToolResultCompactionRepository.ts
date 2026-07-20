import type { ToolResultCompactionDao, ToolResultCompactionLevel } from '../dao/ToolResultCompactionDao'
import {
  type CreateToolResultCompaction,
  type ToolResultCompaction,
  type ToolResultCompactionExecution,
  toToolResultCompaction,
  toToolResultCompactionExecutionRow,
  toToolResultCompactionInsertRow
} from '../mappers/ToolResultCompactionMapper'

type Deps = {
  hasDb: () => boolean
  getToolResultCompactionDao: () => ToolResultCompactionDao | undefined
  now?: () => number
}

export class ToolResultCompactionRepository {
  private readonly now: () => number

  constructor(private readonly deps: Deps) {
    this.now = deps.now ?? Date.now
  }

  createPending(input: CreateToolResultCompaction): number {
    const now = this.now()
    return this.requireDao().upsertPending(toToolResultCompactionInsertRow(input, now))
  }

  markRunning(id: number): boolean {
    return this.requireDao().markRunning(id, this.now())
  }

  markReady(
    id: number,
    content: string,
    compactedCharacters: number,
    estimatedTokens: number,
    execution?: ToolResultCompactionExecution
  ): void {
    this.requireDao().markReady(
      id,
      content,
      compactedCharacters,
      estimatedTokens,
      execution ? toToolResultCompactionExecutionRow(execution) : undefined,
      this.now()
    )
  }

  markFailed(id: number, errorCode: string): void {
    this.requireDao().markFailed(id, errorCode, this.now())
  }

  getReadyByMessageIds(messageIds: number[]): ToolResultCompaction[] {
    return this.requireDao().getReadyByMessageIds(messageIds).map(toToolResultCompaction)
  }

  getByMessageLevelAndHash(
    messageId: number,
    level: ToolResultCompactionLevel,
    originalHash: string,
    compactorId?: string,
    compactorVersion?: number
  ): ToolResultCompaction | undefined {
    const row = this.requireDao().getByIdentity(
      messageId,
      level,
      originalHash,
      compactorId,
      compactorVersion
    )
    return row ? toToolResultCompaction(row) : undefined
  }

  private requireDao(): ToolResultCompactionDao {
    if (!this.deps.hasDb()) throw new Error('Database not initialized')
    const dao = this.deps.getToolResultCompactionDao()
    if (!dao) throw new Error('Tool result compaction repository not initialized')
    return dao
  }
}

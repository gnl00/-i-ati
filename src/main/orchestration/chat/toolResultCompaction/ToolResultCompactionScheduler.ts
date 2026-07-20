import { createHash } from 'node:crypto'
import type { chatDb } from '@main/db/chat'
import type { ToolResultFact } from '@main/agent/runtime/tools/ToolResultFact'
import { createLogger } from '@main/logging/LogService'
import { embeddedToolsRegistry } from '@tools/registry'
import { ToolResultCompactorRegistry } from './ToolResultCompactorRegistry'
import { ExecuteCommandResultCompactor } from './ExecuteCommandResultCompactor'
import { WebFetchResultCompactor } from './WebFetchResultCompactor'

const logger = createLogger('ToolResultCompactionScheduler')

export interface PersistedToolResult {
  messageId: number
  result: ToolResultFact
  rawContent: string
  args?: unknown
  signal?: AbortSignal
}

export type ToolResultCompactionResolutionReason =
  | 'compacted'
  | 'disabled'
  | 'compactor_unavailable'
  | 'empty_compaction'
  | 'no_size_gain'
  | 'compaction_in_progress'
  | 'aborted'
  | 'compaction_failed'

export interface ToolResultCompactionResolution {
  content: string
  source: 'raw' | 'compact'
  reason: ToolResultCompactionResolutionReason
}

export interface ToolResultCompactionStore {
  createPendingToolResultCompaction: typeof chatDb.createPendingToolResultCompaction
  markToolResultCompactionRunning: typeof chatDb.markToolResultCompactionRunning
  markToolResultCompactionReady: typeof chatDb.markToolResultCompactionReady
  markToolResultCompactionFailed: typeof chatDb.markToolResultCompactionFailed
  getToolResultCompaction?: typeof chatDb.getToolResultCompaction
}

export interface ToolResultCompactionScheduler {
  schedule(input: PersistedToolResult): void
  resolve(input: PersistedToolResult): Promise<ToolResultCompactionResolution>
}

const toErrorCode = (error: unknown): string => {
  if (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && typeof error.code === 'string'
  ) {
    return error.code
  }
  return error instanceof Error ? error.name : 'UNKNOWN_ERROR'
}

export class DefaultToolResultCompactionScheduler implements ToolResultCompactionScheduler {
  private readonly inFlight = new Map<string, Promise<ToolResultCompactionResolution>>()

  constructor(
    private readonly store?: ToolResultCompactionStore,
    private readonly registry = new ToolResultCompactorRegistry([
      new WebFetchResultCompactor(),
      new ExecuteCommandResultCompactor()
    ])
  ) {}

  schedule(input: PersistedToolResult): void {
    void this.resolve(input)
  }

  async resolve(input: PersistedToolResult): Promise<ToolResultCompactionResolution> {
    const metadata = embeddedToolsRegistry.getToolMetadata(input.result.toolName)?.resultCompaction
    if (!metadata?.enabled) {
      return this.rawResolution(input, 'disabled')
    }
    if (input.signal?.aborted) {
      return this.rawResolution(input, 'aborted')
    }

    const compactor = this.registry.get(metadata.compactorId)
    if (!compactor) {
      logger.warn('tool_result.compaction.skipped', {
        messageId: input.messageId,
        toolName: input.result.toolName,
        toolCallId: input.result.toolCallId,
        compactorId: metadata.compactorId,
        reason: 'compactor_unavailable'
      })
      return this.rawResolution(input, 'compactor_unavailable')
    }

    const originalHash = createHash('sha256').update(input.rawContent).digest('hex')
    const identity = [
      input.messageId,
      metadata.level,
      compactor.id,
      compactor.version,
      originalHash
    ].join(':')
    const active = this.inFlight.get(identity)
    if (active) {
      return active
    }

    const operation = this.run(
      input,
      metadata.level,
      metadata.modelInputPolicy ?? 'redact-secrets',
      compactor,
      originalHash
    ).finally(() => {
      this.inFlight.delete(identity)
    })
    this.inFlight.set(identity, operation)

    try {
      return await operation
    } catch (error) {
      logger.error('tool_result.compaction.failed', {
        messageId: input.messageId,
        toolName: input.result.toolName,
        toolCallId: input.result.toolCallId,
        errorCode: toErrorCode(error)
      })
      return this.rawResolution(input, 'compaction_failed')
    }
  }

  private async run(
    input: PersistedToolResult,
    level: 'balanced' | 'minimal',
    modelInputPolicy: 'redact-secrets' | 'verbatim',
    compactor: NonNullable<ReturnType<ToolResultCompactorRegistry['get']>>,
    originalHash: string
  ): Promise<ToolResultCompactionResolution> {
    const store = this.store ?? (await import('@main/db/chat')).chatDb
    const compactionId = store.createPendingToolResultCompaction({
      messageId: input.messageId,
      toolName: input.result.toolName,
      toolCallId: input.result.toolCallId,
      level,
      originalHash,
      originalCharacters: input.rawContent.length,
      compactorId: compactor.id,
      compactorVersion: compactor.version
    })

    try {
      const claimed = store.markToolResultCompactionRunning(compactionId)
      if (claimed === false) {
        const existing = store.getToolResultCompaction?.(
          input.messageId,
          level,
          originalHash,
          compactor.id,
          compactor.version
        )
        if (existing?.status === 'ready' && existing.content) {
          return existing.content === input.rawContent
            ? this.rawResolution(input, 'no_size_gain')
            : {
                content: existing.content,
                source: 'compact',
                reason: 'compacted'
              }
        }
        return this.rawResolution(input, 'compaction_in_progress')
      }
      logger.info('tool_result.compaction.started', {
        compactionId,
        messageId: input.messageId,
        toolName: input.result.toolName,
        toolCallId: input.result.toolCallId,
        level,
        compactorId: compactor.id,
        originalCharacters: input.rawContent.length
      })
      const output = await compactor.compact({
        messageId: input.messageId,
        toolName: input.result.toolName,
        toolCallId: input.result.toolCallId,
        status: input.result.status,
        args: input.args,
        rawContent: input.rawContent,
        level,
        modelInputPolicy,
        signal: input.signal
      })
      if (!output) {
        store.markToolResultCompactionReady(
          compactionId,
          input.rawContent,
          input.rawContent.length,
          Math.ceil(input.rawContent.length / 4)
        )
        logger.info('tool_result.compaction.skipped', {
          compactionId,
          messageId: input.messageId,
          toolName: input.result.toolName,
          toolCallId: input.result.toolCallId,
          reason: 'empty_compaction'
        })
        return this.rawResolution(input, 'empty_compaction')
      }
      const compactedCharacters = output.content.length
      if (compactedCharacters >= input.rawContent.length) {
        store.markToolResultCompactionReady(
          compactionId,
          input.rawContent,
          input.rawContent.length,
          Math.ceil(input.rawContent.length / 4),
          output.execution
        )
        logger.info('tool_result.compaction.skipped', {
          compactionId,
          messageId: input.messageId,
          toolName: input.result.toolName,
          toolCallId: input.result.toolCallId,
          reason: 'no_size_gain',
          originalCharacters: input.rawContent.length,
          compactedCharacters,
          executionType: output.execution.executionType,
          modelId: output.execution.modelId,
          latencyMs: output.execution.latencyMs,
          inputCharacters: output.execution.inputCharacters,
          sentCharacters: output.execution.sentCharacters,
          inputTruncated: output.execution.inputTruncated,
          redactionCount: output.execution.redactionCount
        })
        return this.rawResolution(input, 'no_size_gain')
      }
      store.markToolResultCompactionReady(
        compactionId,
        output.content,
        compactedCharacters,
        output.estimatedTokens,
        output.execution
      )
      logger.info('tool_result.compaction.ready', {
        compactionId,
        messageId: input.messageId,
        toolName: input.result.toolName,
        toolCallId: input.result.toolCallId,
        originalCharacters: input.rawContent.length,
        compactedCharacters,
        estimatedTokens: output.estimatedTokens,
        executionType: output.execution.executionType,
        modelId: output.execution.modelId,
        latencyMs: output.execution.latencyMs,
        inputCharacters: output.execution.inputCharacters,
        sentCharacters: output.execution.sentCharacters,
        inputTruncated: output.execution.inputTruncated,
        redactionCount: output.execution.redactionCount
      })
      return {
        content: output.content,
        source: 'compact',
        reason: 'compacted'
      }
    } catch (error) {
      const errorCode = toErrorCode(error)
      store.markToolResultCompactionFailed(compactionId, errorCode)
      logger.error('tool_result.compaction.failed', {
        compactionId,
        messageId: input.messageId,
        toolName: input.result.toolName,
        toolCallId: input.result.toolCallId,
        errorCode
      })
      return this.rawResolution(input, 'compaction_failed')
    }
  }

  private rawResolution(
    input: PersistedToolResult,
    reason: Exclude<ToolResultCompactionResolutionReason, 'compacted'>
  ): ToolResultCompactionResolution {
    return {
      content: input.rawContent,
      source: 'raw',
      reason
    }
  }
}

export const toolResultCompactionScheduler = new DefaultToolResultCompactionScheduler()

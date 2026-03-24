import { createLogger } from '@main/services/logging/LogService'
import type { SubagentRecord } from '@tools/subagent/index.d'
import { SubagentRegistry } from './subagent-registry'
import { SubagentRuntimeFactory } from './subagent-runtime-factory'
import { subagentRuntimeBridge } from './subagent-runtime-bridge'
import type { SubagentSpawnInput } from './types'

const logger = createLogger('SubagentRunService')

export class SubagentRunService {
  constructor(
    private readonly registry = new SubagentRegistry(),
    private readonly runtimeFactory = new SubagentRuntimeFactory()
  ) {}

  async spawn(input: SubagentSpawnInput): Promise<SubagentRecord> {
    const record = this.registry.create({
      task: input.task,
      role: input.role,
      parentChatUuid: input.chatUuid
    })

    logger.info('subagent.spawned', {
      subagentId: record.id,
      role: record.role,
      parentChatUuid: record.parent_chat_uuid
    })
    if (input.parentSubmissionId) {
      subagentRuntimeBridge.emitSubagentUpdated(input.parentSubmissionId, record)
    }

    void this.runBackground(record.id, {
      ...input,
      subagentId: record.id
    })
    return record
  }

  async wait(id: string, timeoutMs: number): Promise<SubagentRecord | null> {
    return await this.registry.wait(id, timeoutMs)
  }

  get(id: string): SubagentRecord | null {
    return this.registry.get(id)
  }

  private async runBackground(id: string, input: SubagentSpawnInput): Promise<void> {
    const running = this.registry.markRunning(id)
    const startedAt = Date.now()
    logger.info('subagent.started', { subagentId: id, role: input.role })
    if (running && input.parentSubmissionId) {
      subagentRuntimeBridge.emitSubagentUpdated(input.parentSubmissionId, running)
    }

    try {
      const result = await this.runtimeFactory.run(input)
      const completed = this.registry.markCompleted(id, result.summary, result.artifacts)
      logger.info('subagent.completed', {
        subagentId: id,
        elapsedMs: Date.now() - startedAt,
        toolsUsed: completed?.artifacts?.tools_used.length ?? 0,
        filesTouched: completed?.artifacts?.files_touched.length ?? 0
      })
      if (completed && input.parentSubmissionId) {
        subagentRuntimeBridge.emitSubagentUpdated(input.parentSubmissionId, completed)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const failed = this.registry.markFailed(id, message)
      logger.error('subagent.failed', {
        subagentId: id,
        elapsedMs: Date.now() - startedAt,
        error: message
      })
      if (failed && input.parentSubmissionId) {
        subagentRuntimeBridge.emitSubagentUpdated(input.parentSubmissionId, failed)
      }
    }
  }
}

const subagentRunService = new SubagentRunService()

export default subagentRunService

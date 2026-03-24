import { v4 as uuidv4 } from 'uuid'
import type {
  SubagentArtifacts,
  SubagentRecord,
  SubagentRole
} from '@tools/subagent/index.d'
import type {
  SubagentRecordInternal,
  SubagentTerminalStatus
} from './types'

type CreateInput = {
  task: string
  role: SubagentRole
  parentChatUuid?: string
}

export class SubagentRegistry {
  private readonly records = new Map<string, SubagentRecordInternal>()

  create(input: CreateInput): SubagentRecord {
    let resolveCompletion = () => {}
    const completion = new Promise<void>((resolve) => {
      resolveCompletion = resolve
    })

    const record: SubagentRecordInternal = {
      id: uuidv4(),
      status: 'queued',
      role: input.role,
      task: input.task,
      created_at: Date.now(),
      parent_chat_uuid: input.parentChatUuid,
      completion,
      resolveCompletion
    }

    this.records.set(record.id, record)
    return this.snapshot(record)
  }

  markRunning(id: string): SubagentRecord | null {
    const record = this.records.get(id)
    if (!record) return null
    record.status = 'running'
    record.started_at = Date.now()
    return this.snapshot(record)
  }

  markCompleted(id: string, summary: string, artifacts: SubagentArtifacts): SubagentRecord | null {
    return this.markTerminal(id, 'completed', {
      summary,
      artifacts
    })
  }

  markFailed(id: string, error: string): SubagentRecord | null {
    return this.markTerminal(id, 'failed', { error })
  }

  get(id: string): SubagentRecord | null {
    const record = this.records.get(id)
    return record ? this.snapshot(record) : null
  }

  async wait(id: string, timeoutMs: number): Promise<SubagentRecord | null> {
    const record = this.records.get(id)
    if (!record) {
      return null
    }

    if (this.isTerminal(record.status)) {
      return this.snapshot(record)
    }

    await Promise.race([
      record.completion,
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))
    ])

    const latest = this.records.get(id)
    return latest ? this.snapshot(latest) : null
  }

  private markTerminal(
    id: string,
    status: SubagentTerminalStatus,
    patch: {
      summary?: string
      artifacts?: SubagentArtifacts
      error?: string
    }
  ): SubagentRecord | null {
    const record = this.records.get(id)
    if (!record) return null
    record.status = status
    record.finished_at = Date.now()
    record.summary = patch.summary
    record.artifacts = patch.artifacts
    record.error = patch.error
    record.resolveCompletion()
    return this.snapshot(record)
  }

  private isTerminal(status: SubagentRecord['status']): status is SubagentTerminalStatus {
    return status === 'completed' || status === 'failed' || status === 'cancelled'
  }

  private snapshot(record: SubagentRecordInternal): SubagentRecord {
    return {
      id: record.id,
      status: record.status,
      role: record.role,
      task: record.task,
      created_at: record.created_at,
      started_at: record.started_at,
      finished_at: record.finished_at,
      summary: record.summary,
      artifacts: record.artifacts,
      error: record.error,
      parent_chat_uuid: record.parent_chat_uuid
    }
  }
}

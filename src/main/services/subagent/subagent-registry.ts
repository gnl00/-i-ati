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
  parentSubmissionId?: string
  id?: string
  revision?: number
}

export class SubagentRegistry {
  private readonly records = new Map<string, SubagentRecordInternal>()

  create(input: CreateInput): SubagentRecord {
    const record: SubagentRecordInternal = {
      id: input.id ?? uuidv4(),
      run_id: uuidv4(),
      parent_submission_id: input.parentSubmissionId,
      revision: input.revision ?? 1,
      status: 'queued',
      role: input.role,
      task: input.task,
      created_at: Date.now(),
      parent_chat_uuid: input.parentChatUuid,
      waiters: new Set()
    }

    record.result_ref = record.run_id
    this.records.set(record.id, record)
    return this.snapshot(record)
  }

  restore(record: SubagentRecord): void {
    this.records.set(record.id, { ...record, waiters: new Set() })
  }

  markPersistenceError(id: string, error: string): SubagentRecord | null {
    const record = this.records.get(id)
    if (!record) return null
    if (record.persistence_error !== error) {
      record.persistence_error = error
      record.revision = (record.revision ?? 0) + 1
      this.notify(record)
    }
    return this.snapshot(record)
  }

  markRunning(id: string): SubagentRecord | null {
    const record = this.records.get(id)
    if (!record || record.status !== 'queued') return null
    record.status = 'running'
    record.revision = (record.revision ?? 0) + 1
    record.started_at = Date.now()
    this.notify(record)
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

  markCancelling(id: string): SubagentRecord | null {
    const record = this.records.get(id)
    if (!record || this.isTerminal(record.status) || record.status === 'cancelling') return null
    record.status = 'cancelling'
    record.revision = (record.revision ?? 0) + 1
    this.notify(record)
    return this.snapshot(record)
  }

  markCancelled(id: string, reason: string, summary?: string, artifacts?: SubagentArtifacts): SubagentRecord | null {
    return this.markTerminal(id, 'cancelled', { error: reason, summary, artifacts })
  }

  finish(id: string, result: { status: SubagentTerminalStatus; summary: string; artifacts: SubagentArtifacts; error?: string; usage?: ITokenUsage }): SubagentRecord | null {
    return this.markTerminal(id, result.status, result)
  }

  get(id: string): SubagentRecord | null {
    const record = this.records.get(id)
    return record ? this.snapshot(record) : null
  }

  list(chatUuid: string): SubagentRecord[] {
    return [...this.records.values()].filter(record => record.parent_chat_uuid === chatUuid).map(record => this.snapshot(record))
  }

  async wait(id: string, timeoutMs: number, signal?: AbortSignal, afterRevision?: number): Promise<SubagentRecord | null> {
    const record = this.records.get(id)
    if (!record) {
      return null
    }

    if (this.isTerminal(record.status) || (afterRevision !== undefined && (record.revision ?? 0) > afterRevision)) {
      return this.snapshot(record)
    }

    signal?.throwIfAborted()
    let timer: ReturnType<typeof setTimeout> | undefined
    let onAbort: (() => void) | undefined
    let onChange: (() => void) | undefined
    try {
      await new Promise<void>((resolve, reject) => {
        timer = setTimeout(resolve, Math.max(0, timeoutMs))
        onChange = (): void => { if (this.isTerminal(record.status) || afterRevision !== undefined) resolve() }
        record.waiters.add(onChange)
        if (signal) {
          onAbort = (): void => reject(signal.reason)
          signal.addEventListener('abort', onAbort, { once: true })
        }
      })
    } finally {
      clearTimeout(timer)
      if (onAbort) signal?.removeEventListener('abort', onAbort)
      if (onChange) record.waiters.delete(onChange)
    }

    return this.snapshot(record)
  }

  private markTerminal(
    id: string,
    status: SubagentTerminalStatus,
    patch: {
      usage?: ITokenUsage
      summary?: string
      artifacts?: SubagentArtifacts
      error?: string
    }
  ): SubagentRecord | null {
    const record = this.records.get(id)
    if (!record || this.isTerminal(record.status) || (record.status === 'cancelling' && status !== 'cancelled')) return null
    record.status = status
    record.revision = (record.revision ?? 0) + 1
    record.finished_at = Date.now()
    record.usage = patch.usage
    record.summary = patch.summary
    record.artifacts = patch.artifacts
    record.error = patch.error
    this.notify(record)
    return this.snapshot(record)
  }

  private notify(record: SubagentRecordInternal): void {
    for (const waiter of record.waiters) waiter()
  }

  private isTerminal(status: SubagentRecord['status']): status is SubagentTerminalStatus {
    return status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'interrupted'
  }

  private snapshot(record: SubagentRecordInternal): SubagentRecord {
    return {
      id: record.id,
      revision: record.revision,
      run_id: record.run_id,
      parent_submission_id: record.parent_submission_id,
      result_ref: record.result_ref,
      persistence_error: record.persistence_error,
      status: record.status,
      role: record.role,
      task: record.task,
      created_at: record.created_at,
      started_at: record.started_at,
      finished_at: record.finished_at,
      usage: record.usage,
      summary: record.summary,
      artifacts: record.artifacts,
      error: record.error,
      parent_chat_uuid: record.parent_chat_uuid
    }
  }
}

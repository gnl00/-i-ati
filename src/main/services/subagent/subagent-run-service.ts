import { createLogger } from '@main/logging/LogService'
import type { SubagentRecord } from '@tools/subagent/index.d'
import { SubagentRegistry } from './subagent-registry'
import type { SubagentRuntimeFactory } from './subagent-runtime-factory'
import { subagentRuntimeBridge } from './subagent-runtime-bridge'
import type { SubagentSpawnInput } from './types'
import type { subagentDb, subagentMessageDb } from '@main/db/subagents'
import type { SubagentMessage } from '@main/db/repositories/SubagentRepository'
import type { AgentSteeringMessage } from '@main/agent/runtime/steering/SteeringMessageSource'
import { normalizePermissionApprovalMode } from '@tools/approval'
import type { StoredSubagentRun } from '@main/db/repositories/SubagentRepository'
import type { ContextSnapshot } from '@main/agent/runtime/context/ContextSnapshot'

const logger = createLogger('SubagentRunService')
export const SUBAGENT_LIMITS = { global: 4, perParent: 2, queued: 16 } as const

type Job = {
  input: SubagentSpawnInput
  controller: AbortController
  releaseChannel: () => void
  completion?: Promise<void>
}

export class SubagentRunService {
  private readonly jobs = new Map<string, Job>()
  private readonly queue: string[] = []
  private readonly active = new Set<string>()
  private stopping = false
  private schedulingPaused = false

  constructor(
    private readonly registry = new SubagentRegistry(),
    private runtimeFactory?: Pick<SubagentRuntimeFactory, 'run'>,
    private persistence?: typeof subagentDb,
    private messages?: typeof subagentMessageDb
  ) {}

  async initialize(): Promise<void> {
    if (this.persistence) return
    const storage = await import('@main/db/subagents')
    const persistence = storage.subagentDb
    persistence.recoverInterrupted()
    this.persistence = persistence
    this.messages = storage.subagentMessageDb
  }

  async spawn(input: SubagentSpawnInput, childId?: string): Promise<SubagentRecord> {
    input.signal?.throwIfAborted()
    if (!childId && (!input.task.trim() || Buffer.byteLength(input.task) > 32_768)) throw new Error('Task text must be between 1 byte and 32 KiB.')
    if (this.persistence && !input.workspacePath) {
      const { resolveWorkspaceRoot } = await import('@main/services/filesystem/WorkspacePathResolver')
      input = { ...input, workspacePath: input.chatUuid ? resolveWorkspaceRoot(input.chatUuid) : process.cwd() }
      input.signal?.throwIfAborted()
    }
    this.assertAdmission(input)
    const previous = childId ? this.get(childId) : null
    if (childId && this.jobs.has(childId)) throw new Error('Subagent is busy. Wait or interrupt before assigning another task.')
    const record = this.registry.create({ id: childId, revision: (previous?.revision ?? 0) + 1, task: input.task, role: input.role, parentChatUuid: input.chatUuid, parentSubmissionId: input.parentSubmissionId })
    input = { ...input, runId: record.run_id }
    try {
      this.persistence?.save({ record, inputJson: this.serializeInput(input) })
    } catch (error) {
      if (previous) this.registry.restore(previous)
      else this.registry.markFailed(record.id, 'Task was not started because its record could not be saved.')
      throw error
    }
    this.jobs.set(record.id, {
      input: { ...input, signal: undefined, subagentId: record.id },
      controller: new AbortController(),
      releaseChannel: subagentRuntimeBridge.retain(input.parentSubmissionId)
    })
    this.queue.push(record.id)
    this.emit(input, record)
    this.pump()
    return record
  }

  async wait(id: string, timeoutMs: number, signal?: AbortSignal, afterRevision?: number): Promise<SubagentRecord | null> {
    if (!this.jobs.has(id)) {
      const current = this.get(id)
      if (current && ['completed', 'failed', 'cancelled', 'interrupted'].includes(current.status)) this.registry.restore(current)
      else if (current) return current
    }
    return this.registry.wait(id, timeoutMs, signal, afterRevision)
  }

  get(id: string): SubagentRecord | null {
    const local = this.registry.get(id)
    const saved = this.persistence?.get(id)?.record
    if (!local || !saved) return local ?? saved ?? null
    return local.run_id === saved.run_id && (local.revision ?? 0) >= (saved.revision ?? 0) ? local : saved
  }

  inspect(id: string, runId?: string): StoredSubagentRun | null {
    return this.persistence?.get(id, runId) ?? null
  }

  sendMessage(childId: string, id: string, body: string, sender: string): SubagentMessage {
    if (!this.messages || !this.get(childId)) throw new Error('Persistent subagent session not found.')
    id = this.messageKey(childId, id)
    if (!body.trim() || Buffer.byteLength(body) > 32_768) throw new Error('Message text must be between 1 byte and 32 KiB.')
    return this.messages.send({ id, childId, body, sender, mode: 'message' })
  }

  async followup(childId: string, id: string, task: string, parentSubmissionId?: string, permissionApprovalMode?: PermissionApprovalMode, signal?: AbortSignal): Promise<SubagentRecord> {
    signal?.throwIfAborted()
    if (!this.messages || !this.persistence) throw new Error('Persistent subagent session not found.')
    id = this.messageKey(childId, id)
    if (!task.trim() || Buffer.byteLength(task) > 32_768) throw new Error('Followup task must be between 1 byte and 32 KiB.')
    const saved = this.persistence.get(childId)
    if (!saved) throw new Error('Subagent not found.')
    const sender = saved.record.parent_chat_uuid ?? parentSubmissionId ?? 'main'
    const prior = this.messages.get(id)
    if (prior && (prior.childId !== childId || prior.body !== task || prior.mode !== 'task' || prior.sender !== sender)) throw new Error('Message ID already belongs to different content.')
    if (prior?.runId) {
      const accepted = this.persistence.get(childId, prior.runId)
      if (!accepted) throw new Error('Task receipt refers to missing run evidence.')
      return accepted.record
    }
    if (this.jobs.has(childId) || ['queued', 'running', 'cancelling', 'waiting_for_confirmation'].includes(saved.record.status)) throw new Error('Subagent is busy. Wait or interrupt before assigning another task.')
    const input = { ...JSON.parse(saved.inputJson), parentSubmissionId } as SubagentSpawnInput
    this.assertAdmission(input)
    this.messages.send({ id, childId, body: task, sender, mode: 'task' })
    const inbox = this.messages.pending(childId).filter(message => message.mode === 'message')
    let context: StoredSubagentRun | null = saved
    const visited = new Set<string>()
    const history: NonNullable<SubagentSpawnInput['history']>[number][] = []
    const segments: ContextSnapshot[] = []
    while (context) {
      if (context.transcriptJson) segments.push(JSON.parse(context.transcriptJson) as ContextSnapshot)
      const previousRunId = (JSON.parse(context.inputJson) as SubagentSpawnInput).previousRunId
      if (!previousRunId) break
      if (visited.has(previousRunId)) throw new Error('Stored subagent history contains a cycle.')
      visited.add(previousRunId)
      const previous = this.persistence.get(childId, previousRunId)
      if (!previous) throw new Error('Previous subagent run evidence is missing.')
      context = previous
    }
    const known = new Set<string>()
    for (const segment of segments.reverse()) {
      for (const record of segment.records) {
        if (!known.has(record.recordId)) history.push(record)
        known.add(record.recordId)
      }
    }
    return this.spawn({
      ...input, task: [task, ...inbox.map(message => `Message ${message.id} from ${message.sender}:\n${message.body}`)].join('\n\n'),
      history, parentSubmissionId, permissionApprovalMode: normalizePermissionApprovalMode(permissionApprovalMode), signal,
      requestMessageId: id, initialMessageIds: inbox.map(message => message.id),
      previousRunId: saved.record.run_id
    }, childId)
  }

  messagesForRun(runId: string): SubagentMessage[] {
    return this.messages?.forRun(runId) ?? []
  }

  private messageKey(childId: string, id: string): string {
    const prefix = `${childId}:`
    const localId = id.startsWith(prefix) ? id.slice(prefix.length) : id
    if (!localId.trim() || localId.length > 128) throw new Error('Message ID must be between 1 and 128 characters.')
    return prefix + localId
  }

  list(chatUuid: string): SubagentRecord[] {
    const records = new Map(this.persistence?.list(chatUuid).map(record => [record.id, record]))
    for (const record of this.registry.list(chatUuid)) {
      const saved = records.get(record.id)
      if (!saved || (saved.run_id === record.run_id && (record.revision ?? 0) >= (saved.revision ?? 0))) records.set(record.id, record)
    }
    return [...records.values()]
  }

  cancel(id: string, reason = 'user_cancelled', runId?: string): SubagentRecord | null {
    const job = this.jobs.get(id)
    if (runId && job?.input.runId !== runId) return this.persistence?.get(id, runId)?.record ?? null
    if (!job) return this.get(id)
    const queuedIndex = this.queue.indexOf(id)
    if (queuedIndex >= 0) {
      this.queue.splice(queuedIndex, 1)
      const record = this.registry.markCancelled(id, reason)
      this.emit(job.input, record)
      this.release(id, job)
      this.pump()
    } else if (!job.controller.signal.aborted) {
      this.emit(job.input, this.registry.markCancelling(id))
      job.controller.abort(reason)
    }
    return this.registry.get(id)
  }

  cancelForParent(parentSubmissionId: string): void {
    // Cancel queued work first so releasing a slot cannot start another child of this parent.
    const ids = [...this.queue, ...this.active]
    this.schedulingPaused = true
    try {
      for (const id of ids) {
        if (this.jobs.get(id)?.input.parentSubmissionId === parentSubmissionId) this.cancel(id)
      }
    } finally {
      this.schedulingPaused = false
      this.pump()
    }
  }

  hasPending(): boolean {
    return this.jobs.size > 0
  }

  async shutdown(): Promise<void> {
    this.stopping = true
    for (const id of [...this.jobs.keys()]) this.cancel(id, 'application_shutdown')
    await Promise.all([...this.jobs.values()].map(job => job.completion))
  }

  private parentKey(input: SubagentSpawnInput): string {
    return input.chatUuid ?? input.parentSubmissionId ?? 'standalone'
  }

  private assertAdmission(input: SubagentSpawnInput): void {
    if (this.stopping) throw new Error('Subagent service is stopping.')
    if (this.queue.length >= SUBAGENT_LIMITS.queued && !this.canStart(input)) throw new Error('Subagent queue is full. Wait for a task to finish before spawning another.')
  }

  private pump(): void {
    if (this.stopping || this.schedulingPaused) return
    while (this.active.size < SUBAGENT_LIMITS.global) {
      const index = this.queue.findIndex(id => this.canStart(this.jobs.get(id)!.input))
      if (index < 0) return
      const [id] = this.queue.splice(index, 1)
      const job = this.jobs.get(id)!
      this.active.add(id)
      job.completion = this.runBackground(id, job)
    }
  }

  private canStart(input: SubagentSpawnInput): boolean {
    return this.active.size < SUBAGENT_LIMITS.global
      && [...this.active].filter(id => this.parentKey(this.jobs.get(id)!.input) === this.parentKey(input)).length < SUBAGENT_LIMITS.perParent
  }

  private async runBackground(id: string, job: Job): Promise<void> {
    const { input, controller } = job
    this.emit(input, this.registry.markRunning(id))
    logger.info('subagent.started', { subagentId: id, role: input.role })
    try {
      this.runtimeFactory ??= new (await import('./subagent-runtime-factory')).SubagentRuntimeFactory()
      controller.signal.throwIfAborted()
      const result = await this.runtimeFactory.run({
        ...input, signal: controller.signal,
        steeringMessageSource: this.messages ? {
          take: (): AgentSteeringMessage | undefined => {
            const message = this.messages!.pending(id).find(item => item.mode === 'message')
            if (!message || controller.signal.aborted) return undefined
            this.messages!.deliver(message.id, input.runId!)
            return { queueItemId: message.id, text: message.body, imageUrls: [], content: [{ type: 'input_text', text: `Message from ${message.sender}:\n${message.body}` }] }
          },
          acknowledge: (messageId): void => this.messages!.acknowledge(messageId, input.runId!)
        } : undefined
      })
      const status = controller.signal.aborted ? 'cancelled' : result.status
      try {
        for (const messageId of [input.requestMessageId, ...(input.initialMessageIds ?? [])]) {
          if (messageId) this.messages?.acknowledge(messageId, input.runId!)
        }
      } catch (error) {
        this.registry.markPersistenceError(id, `Message receipt persistence failed: ${String(error)}`)
      }
      const previousRecords = new Set(input.history?.map(record => record.recordId))
      const transcript = result.transcript ? {
        ...result.transcript,
        records: result.transcript.records.filter(record => !previousRecords.has(record.recordId))
      } : undefined
      this.emit(input, this.registry.finish(id, {
        ...result,
        status,
        error: status === 'cancelled' ? String(controller.signal.reason ?? result.error ?? 'cancelled') : result.error
      }), transcript)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.emit(input, controller.signal.aborted
        ? this.registry.markCancelled(id, String(controller.signal.reason ?? message))
        : this.registry.markFailed(id, message))
    } finally {
      logger.info('subagent.finished', { subagentId: id, status: this.registry.get(id)?.status })
      this.release(id, job)
      this.pump()
    }
  }

  private release(id: string, job: Job): void {
    this.active.delete(id)
    this.jobs.delete(id)
    job.releaseChannel()
  }

  private emit(input: SubagentSpawnInput, record: SubagentRecord | null, transcript?: ContextSnapshot): void {
    if (record && this.persistence) {
      try {
        this.persistence.save({ record, inputJson: this.serializeInput(input), transcriptJson: transcript ? JSON.stringify(transcript) : undefined })
      } catch (error) {
        logger.error('subagent.persistence_failed', { subagentId: record.id, error: String(error) })
        record = this.registry.markPersistenceError(record.id, String(error))
      }
    }
    if (record && input.parentSubmissionId) subagentRuntimeBridge.emitSubagentUpdated(input.parentSubmissionId, record)
  }

  private serializeInput(input: SubagentSpawnInput): string {
    const snapshot = { ...input }
    delete snapshot.signal
    delete snapshot.history
    delete snapshot.steeringMessageSource
    return JSON.stringify(snapshot)
  }
}

const subagentRunService = new SubagentRunService()
export default subagentRunService

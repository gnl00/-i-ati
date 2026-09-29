import { HostOutputDispatcher } from '@main/hosts/shared/output/HostOutputDispatcher'
import type { ToolConfirmationListener } from '@main/agent/contracts/ToolConfirmation'
import { randomUUID } from 'node:crypto'
import type { RunEventEmitter } from '@main/agent/contracts'
import { RUN_TOOL_EVENTS } from '@shared/run/tool-events'
import type {
  TelegramConfirmationTarget,
  ToolConfirmation,
  ToolConfirmationActor,
  ToolConfirmationDecision,
  ToolConfirmationRequest,
  ToolConfirmationSnapshot,
  ToolConfirmationStatus,
  ToolConfirmationSubmitResult
} from '@shared/tools/confirmation'
export type { ToolConfirmationDecision, ToolConfirmationRequest } from '@shared/tools/confirmation'

type PendingConfirmation = {
  descriptor: ToolConfirmation
  emitter: RunEventEmitter
  telegramTargets: TelegramConfirmationTarget[]
  promise: Promise<ToolConfirmationDecision>
  resolve: (decision: ToolConfirmationDecision) => void
  timeoutId: NodeJS.Timeout
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000
const MAX_RESOLVED = 500

export class ToolConfirmationManager {
  private readonly pending = new Map<string, PendingConfirmation>()
  private readonly resolved = new Map<string, Pick<PendingConfirmation, 'descriptor' | 'telegramTargets'>>()
  private version = 0
  constructor(private readonly dispatcher = new HostOutputDispatcher()) {}

  subscribe(listener: ToolConfirmationListener): () => void {
    return this.dispatcher.register({
      name: 'Confirmation adapter',
      accepts: (output): boolean => output.kind === 'confirmation',
      deliver: (output): void => {
        if (output.kind === 'confirmation') listener(output.confirmation, output.targets)
      }
    })
  }

  private publish(confirmation: ToolConfirmation, targets: TelegramConfirmationTarget[]): void {
    void this.dispatcher.dispatch({ kind: 'confirmation', confirmation, targets })
  }

  request(
    emitter: RunEventEmitter,
    request: ToolConfirmationRequest,
    telegramTarget?: TelegramConfirmationTarget | TelegramConfirmationTarget[]
  ): Promise<ToolConfirmationDecision> {
    const existing = Array.from(this.pending.values()).find(item => (
      item.descriptor.submissionId === emitter.submissionId
      && item.descriptor.toolCallId === request.toolCallId
    ))
    if (existing) return existing.promise
    if (!emitter.chatUuid) throw new Error('Tool confirmation requires a prepared chat identity')

    const createdAt = Date.now()
    const descriptor: ToolConfirmation = {
      ...request,
      confirmationId: randomUUID().replaceAll('-', ''),
      submissionId: emitter.submissionId,
      chatUuid: emitter.chatUuid,
      createdAt,
      expiresAt: createdAt + DEFAULT_TIMEOUT_MS,
      status: 'pending',
      version: ++this.version
    }
    let resolvePromise!: (decision: ToolConfirmationDecision) => void
    const promise = new Promise<ToolConfirmationDecision>(resolve => { resolvePromise = resolve })
    const timeoutId = setTimeout(() => {
      this.finish(descriptor.confirmationId, { approved: false, reason: 'timeout' }, 'expired', {
        host: 'system', cause: 'timeout'
      })
    }, DEFAULT_TIMEOUT_MS)
    this.pending.set(descriptor.confirmationId, {
      descriptor, emitter, telegramTargets: (Array.isArray(telegramTarget) ? telegramTarget : telegramTarget ? [telegramTarget] : []).map(target => ({ ...target })), promise, resolve: resolvePromise, timeoutId
    })
    emitter.emit(RUN_TOOL_EVENTS.TOOL_CONFIRMATION_REQUIRED, descriptor)
    const pending = this.pending.get(descriptor.confirmationId)
    if (pending) this.publish(descriptor, pending.telegramTargets)
    return promise
  }

  submit(raw: unknown, actor: ToolConfirmationActor): ToolConfirmationSubmitResult {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'invalid_request' }
    const request = raw as Record<string, unknown>
    if (
      !['confirmationId', 'submissionId', 'chatUuid', 'toolCallId'].every(key => (
        typeof request[key] === 'string' && (request[key] as string).trim().length > 0
      ))
      || typeof request.approved !== 'boolean'
      || (request.reason !== undefined && typeof request.reason !== 'string')
    ) return { ok: false, reason: 'invalid_request' }

    const id = request.confirmationId as string
    const item = this.pending.get(id) ?? this.resolved.get(id)
    if (!item) return { ok: false, reason: 'not_found' }
    const descriptor = item.descriptor
    if (
      request.submissionId !== descriptor.submissionId
      || request.chatUuid !== descriptor.chatUuid
      || request.toolCallId !== descriptor.toolCallId
      || (actor.host === 'telegram' && (
        !item.telegramTargets.some(target => actor.peerId === target.peerId && actor.threadId === target.threadId)
      ))
    ) return { ok: false, reason: 'identity_mismatch' }
    if (descriptor.status !== 'pending') return { ok: false, reason: 'already_resolved', confirmation: descriptor }
    if (Date.now() >= descriptor.expiresAt) {
      const expired = this.finish(id, { approved: false, reason: 'timeout' }, 'expired', { host: 'system', cause: 'timeout' })
      return { ok: false, reason: 'already_resolved', confirmation: expired }
    }
    const decision: ToolConfirmationDecision = {
      approved: request.approved,
      ...(typeof request.reason === 'string' ? { reason: request.reason } : {}),
      ...(request.args !== undefined ? { args: request.args } : {})
    }
    return {
      ok: true,
      confirmation: this.finish(id, decision, decision.approved ? 'approved' : 'denied', actor)!
    }
  }

  submitTelegram(
    confirmationId: string,
    decision: ToolConfirmationDecision,
    actor: Extract<ToolConfirmationActor, { host: 'telegram' }>
  ): ToolConfirmationSubmitResult {
    const item = this.pending.get(confirmationId) ?? this.resolved.get(confirmationId)
    if (!item) return { ok: false, reason: 'not_found' }
    const { submissionId, chatUuid, toolCallId } = item.descriptor
    return this.submit({ confirmationId, submissionId, chatUuid, toolCallId, ...decision }, actor)
  }

  snapshot(chatUuid: string): ToolConfirmationSnapshot {
    return {
      version: this.version,
      confirmations: [...this.resolved.values(), ...this.pending.values()]
        .map(item => item.descriptor)
        .filter(item => item.chatUuid === chatUuid)
        .sort((a, b) => a.version - b.version)
    }
  }

  cancelForSubmission(submissionId: string, reason = 'aborted'): void {
    for (const [id, item] of this.pending) {
      if (item.descriptor.submissionId === submissionId) {
        this.finish(id, { approved: false, reason }, 'cancelled', { host: 'system', cause: 'run_cancelled' })
      }
    }
  }

  approvePendingForSubmission(submissionId: string, reason = 'permission_approval_mode_auto'): void {
    for (const [id, item] of this.pending) {
      if (item.descriptor.submissionId === submissionId) {
        if (Date.now() >= item.descriptor.expiresAt) {
          this.finish(id, { approved: false, reason: 'timeout' }, 'expired', { host: 'system', cause: 'timeout' })
        } else {
          this.finish(id, { approved: true, reason }, 'approved', { host: 'system', cause: 'auto' })
        }
      }
    }
  }

  private finish(
    id: string,
    decision: ToolConfirmationDecision,
    status: ToolConfirmationStatus,
    actor: ToolConfirmationActor
  ): ToolConfirmation | undefined {
    const item = this.pending.get(id)
    if (!item) return undefined
    clearTimeout(item.timeoutId)
    this.pending.delete(id)
    const descriptor: ToolConfirmation = {
      ...item.descriptor, status, resolvedAt: Date.now(), resolvedBy: actor,
      reason: decision.reason, decision, version: ++this.version
    }
    this.resolved.set(id, { descriptor, telegramTargets: item.telegramTargets })
    if (this.resolved.size > MAX_RESOLVED) this.resolved.delete(this.resolved.keys().next().value!)
    // Publish the decision before execution can resume. Host delivery never owns the decision.
    try {
      this.publish(descriptor, item.telegramTargets)
      item.emitter.emit(RUN_TOOL_EVENTS.TOOL_CONFIRMATION_RESOLVED, descriptor)
    } catch (error) {
      console.warn('[ToolConfirmation] Decision delivery failed', error)
    } finally {
      item.resolve(decision)
    }
    return descriptor
  }
}

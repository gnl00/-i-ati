import type { ToolConfirmationRequester } from '@main/agent/contracts'
import { AbortError } from './errors'
import { ChatAgentAdapter } from '@main/hosts/chat/ChatAgentAdapter'
import type { MainAgentRunInput } from '@main/hosts/chat/preparation/types'
import type { HostRenderEventSink } from '@main/hosts/shared/render'
import type { RunEventEmitter } from '../infrastructure'
import { PostRunJobService } from '@main/orchestration/chat/postRun'
import type { RunResult } from '@main/agent/contracts'
import { RunLifecycleEventMapper } from './RunLifecycleEventMapper'
import { RunFinalizer } from './RunFinalizer'
import { serializeError } from '@main/utils/serializeError'
import { normalizePermissionApprovalMode, type PermissionApprovalMode } from '@tools/approval'
import type { MainAgentRuntimeContext, MainAgentRuntimeRunner } from './MainAgentRuntimeRunner'
import {
  measureRunSteerPayloadBytes,
  RUN_STEERING_EVENTS,
  RUN_STEERING_LIMITS
} from '@shared/run/steering-events'
import type { RunSteerRequest, RunSteerResult } from '@shared/run/steering-events'

export type AgentRunServices = {
  mainAgentRuntimeRunner: MainAgentRuntimeRunner
  chatAgentAdapter: ChatAgentAdapter
  postRunJobService: PostRunJobService
}

export type AgentRunRuntime = {
  emitter: RunEventEmitter
  toolConfirmationRequester: ToolConfirmationRequester
  hostRenderSinks?: HostRenderEventSink[]
}

export class AgentRun {
  readonly submissionId: string
  chatUuid?: string
  readonly controller = new AbortController()
  readonly emitter: RunEventEmitter
  private readonly lifecycle: RunLifecycleEventMapper
  private readonly outcomeHandler = new RunFinalizer()
  private readonly runtimeContext: MainAgentRuntimeContext
  private readonly steeringQueue: Array<Omit<RunSteerRequest, 'submissionId' | 'chatUuid'>> = []
  private readonly steeringInFlight = new Map<string, Omit<RunSteerRequest, 'submissionId' | 'chatUuid'>>()
  private readonly steeringActiveItemIds = new Set<string>()
  private readonly steeringAcknowledgedItemIds = new Set<string>()
  private readonly steeringAcknowledgedItemIdOrder: string[] = []
  private pendingSteeringBytes = 0
  private acceptingSteering = true

  constructor(
    private readonly input: MainAgentRunInput,
    private readonly services: AgentRunServices,
    private readonly runtime: AgentRunRuntime
  ) {
    this.submissionId = input.submissionId
    this.chatUuid = input.chatUuid
    this.emitter = runtime.emitter
    this.lifecycle = new RunLifecycleEventMapper(runtime.emitter)
    let permissionApprovalMode = input.input.permissionApprovalMode
      ? normalizePermissionApprovalMode(input.input.permissionApprovalMode)
      : undefined
    this.runtimeContext = {
      getPermissionApprovalMode: () => permissionApprovalMode,
      setPermissionApprovalMode: (mode) => {
        permissionApprovalMode = mode ? normalizePermissionApprovalMode(mode) : undefined
      },
      takeSteeringMessage: () => {
        const message = this.steeringQueue.shift()
        if (message) {
          this.steeringInFlight.set(message.queueItemId, message)
        }
        return message
      },
      acknowledgeSteeringMessage: (queueItemId) => {
        const message = this.steeringInFlight.get(queueItemId)
        if (!message) {
          return
        }
        this.steeringInFlight.delete(queueItemId)
        this.steeringActiveItemIds.delete(queueItemId)
        this.pendingSteeringBytes -= measureRunSteerPayloadBytes(message)
        this.rememberAcknowledgedSteeringItem(queueItemId)
      }
    }
  }

  emitAccepted(): void {
    this.lifecycle.emitAccepted(this.input.submissionId)
  }

  cancel(): void {
    if (!this.controller.signal.aborted) {
      this.controller.abort()
    }
  }

  setPermissionApprovalMode(mode: PermissionApprovalMode): void {
    const nextMode = normalizePermissionApprovalMode(mode)
    this.runtimeContext.setPermissionApprovalMode(nextMode)
    this.lifecycle.emitPermissionApprovalModeChanged(nextMode)
  }

  steer(input: Omit<RunSteerRequest, 'submissionId' | 'chatUuid'>): RunSteerResult {
    if (!this.acceptingSteering) {
      return { accepted: false, reason: 'run_finished' }
    }
    if (
      this.steeringActiveItemIds.has(input.queueItemId)
      || this.steeringAcknowledgedItemIds.has(input.queueItemId)
    ) {
      return { accepted: true }
    }

    if (this.steeringActiveItemIds.size >= RUN_STEERING_LIMITS.maxPendingItems) {
      return { accepted: false, reason: 'queue_full' }
    }

    const payloadBytes = measureRunSteerPayloadBytes(input)
    if (this.pendingSteeringBytes + payloadBytes > RUN_STEERING_LIMITS.maxPendingBytes) {
      return { accepted: false, reason: 'payload_too_large' }
    }

    this.steeringActiveItemIds.add(input.queueItemId)
    this.pendingSteeringBytes += payloadBytes
    this.steeringQueue.push(input)
    return { accepted: true }
  }

  async run(): Promise<RunResult> {
    try {
      this.lifecycle.emitPreparing()
      const { runSpec, chatContext } = await this.services.chatAgentAdapter.prepareRun(
        this.input,
        this.emitter
      )
      this.emitter.setChatMeta({
        chatId: runSpec.runtimeContext.chatId,
        chatUuid: runSpec.runtimeContext.chatUuid
      })
      this.chatUuid = runSpec.runtimeContext.chatUuid

      const runResult = await this.services.mainAgentRuntimeRunner.run({
        runInput: this.input,
        prepared: { runSpec, chatContext },
        runtimeContext: this.runtimeContext,
        emitter: this.emitter,
        hostRenderSinks: this.runtime.hostRenderSinks,
        signal: this.controller.signal,
        toolConfirmationRequester: this.runtime.toolConfirmationRequester
      })

      this.returnPendingSteering()
      return await this.outcomeHandler.handleRuntimeResult({
        input: this.input,
        runtimeResult: runResult.runtimeResult,
        runSpec,
        chatContext,
        emitter: this.emitter,
        chatAgentAdapter: this.services.chatAgentAdapter,
        postRunJobService: this.services.postRunJobService,
        stepCommitter: runResult.stepCommitter
      })
    } catch (error: any) {
      this.returnPendingSteering()
      if (error instanceof AbortError || error?.name === 'AbortError') {
        this.lifecycle.emitAborted()
        return {
          state: 'aborted'
        }
      }

      const serializedError = serializeError(error)
      this.lifecycle.emitFailed(serializedError)
      return {
        state: 'failed',
        error: serializedError
      }
    } finally {
      this.returnPendingSteering()
    }
  }

  private returnPendingSteering(): void {
    this.acceptingSteering = false
    const queueItemIds = [
      ...this.steeringInFlight.keys(),
      ...this.steeringQueue.map(item => item.queueItemId)
    ]
    this.steeringInFlight.clear()
    this.steeringQueue.length = 0
    this.steeringActiveItemIds.clear()
    this.steeringAcknowledgedItemIds.clear()
    this.steeringAcknowledgedItemIdOrder.length = 0
    this.pendingSteeringBytes = 0
    if (queueItemIds.length > 0) {
      this.emitter.emit(RUN_STEERING_EVENTS.STEERING_RETURNED, { queueItemIds })
    }
  }

  private rememberAcknowledgedSteeringItem(queueItemId: string): void {
    this.steeringAcknowledgedItemIds.add(queueItemId)
    this.steeringAcknowledgedItemIdOrder.push(queueItemId)
    if (
      this.steeringAcknowledgedItemIdOrder.length
      <= RUN_STEERING_LIMITS.maxRecentAcknowledgedIds
    ) {
      return
    }

    const expiredId = this.steeringAcknowledgedItemIdOrder.shift()
    if (expiredId) {
      this.steeringAcknowledgedItemIds.delete(expiredId)
    }
  }
}

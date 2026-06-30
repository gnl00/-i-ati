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
    }
  }
}

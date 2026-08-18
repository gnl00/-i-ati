import { AbortError } from './errors'
import type { ToolConfirmationRequester, ToolQuestionRequester } from '@main/agent/contracts'
import { AgentRun } from './AgentRun'
import { PostRunJobService } from '@main/orchestration/chat/postRun'
import { ChatAgentAdapter } from '@main/hosts/chat/ChatAgentAdapter'
import type { MainAgentRunInput } from '@main/hosts/chat/preparation/types'
import type { HostRenderEventSink } from '@main/hosts/shared/render'
import type { RunResult } from '@main/agent/contracts'
import { normalizePermissionApprovalMode, type PermissionApprovalMode } from '@tools/approval'
import type {
  RunEventEmitterFactory,
  RunEventSink,
  ToolConfirmationManager,
  ToolQuestionManager
} from '../infrastructure'
import { RunRegistry } from './RunRegistry'
import type { MainAgentRuntimeRunner } from './MainAgentRuntimeRunner'
import type { RunSteerRequest, RunSteerResult } from '@shared/run/steering-events'

type StartRunResult = {
  accepted: true
  submissionId: string
}

export type RunManagerDependencies = {
  toolConfirmationManager: ToolConfirmationManager
  toolQuestionManager?: ToolQuestionManager
  eventEmitterFactory: RunEventEmitterFactory
  mainAgentRuntimeRunner: MainAgentRuntimeRunner
  chatAgentAdapter: ChatAgentAdapter
  postRunJobService: PostRunJobService
}

export class RunManager {
  private readonly registry = new RunRegistry()

  constructor(private readonly deps: RunManagerDependencies) {}

  // Fire-and-forget entry used by the interactive chat flow.
  async start(
    input: MainAgentRunInput,
    eventSinks: RunEventSink[] = [],
    hostRenderSinks: HostRenderEventSink[] = []
  ): Promise<StartRunResult> {
    const run = this.createRun(input, eventSinks, hostRenderSinks)
    run.emitAccepted()
    void run.run().catch(() => undefined).finally(() => {
      this.registry.delete(input.submissionId)
    })

    return {
      accepted: true,
      submissionId: input.submissionId
    }
  }

  // Execute the main run pipeline and wait for its terminal result,
  // but do not wait for asynchronous post-run jobs like title/compression.
  async execute(
    input: MainAgentRunInput,
    eventSinks: RunEventSink[] = [],
    hostRenderSinks: HostRenderEventSink[] = []
  ): Promise<RunResult> {
    const run = this.createRun(input, eventSinks, hostRenderSinks)
    run.emitAccepted()

    try {
      const result = await run.run()
      if (result.state === 'aborted') {
        throw new AbortError()
      }
      if (result.state === 'failed') {
        const error = new Error(result.error?.message || 'Run failed')
        error.name = result.error?.name || 'Error'
        if (result.error?.stack) {
          error.stack = result.error.stack
        }
        throw error
      }
      return result
    } finally {
      this.registry.delete(input.submissionId)
    }
  }

  cancel(submissionId: string): void {
    const run = this.registry.get(submissionId)
    if (!run) {
      this.deps.toolConfirmationManager.cancelForSubmission(submissionId)
      this.deps.toolQuestionManager?.cancelForSubmission(submissionId)
      return
    }
    run.cancel()
    this.deps.toolConfirmationManager.cancelForSubmission(submissionId)
    this.deps.toolQuestionManager?.cancelForSubmission(submissionId)
  }

  steer(input: RunSteerRequest): RunSteerResult {
    const run = this.registry.get(input.submissionId)
    if (!run) {
      return { accepted: false, reason: 'run_not_found' }
    }
    if (run.chatUuid !== input.chatUuid) {
      return { accepted: false, reason: 'chat_mismatch' }
    }
    return run.steer({
      queueItemId: input.queueItemId,
      text: input.text,
      images: input.images
    })
  }

  hasActiveRunForChat(chatUuid: string): boolean {
    return this.registry.hasActiveRunForChat(chatUuid)
  }

  updateActiveRunPermissionApprovalMode(
    chatUuid: string,
    mode: PermissionApprovalMode
  ): boolean {
    const run = this.registry.getActiveRunForChat(chatUuid)
    if (!run) {
      return false
    }

    const nextMode = normalizePermissionApprovalMode(mode)
    run.setPermissionApprovalMode(nextMode)
    if (nextMode === 'auto') {
      this.deps.toolConfirmationManager.approvePendingForSubmission(run.submissionId)
    }
    return true
  }

  private createRun(
    input: MainAgentRunInput,
    eventSinks: RunEventSink[] = [],
    hostRenderSinks: HostRenderEventSink[] = []
  ): AgentRun {
    const emitter = this.deps.eventEmitterFactory.create({
      submissionId: input.submissionId
    }, eventSinks)
    const toolConfirmationRequester: ToolConfirmationRequester = {
      request: (request) => this.deps.toolConfirmationManager.request(emitter, request)
    }
    const toolQuestionRequester: ToolQuestionRequester = {
      request: (request) => this.deps.toolQuestionManager
        ? this.deps.toolQuestionManager.request(emitter, request)
        : Promise.resolve({ status: 'unavailable', reason: 'User question manager unavailable' })
    }
    const run = new AgentRun(input, {
      mainAgentRuntimeRunner: this.deps.mainAgentRuntimeRunner,
      chatAgentAdapter: this.deps.chatAgentAdapter,
      postRunJobService: this.deps.postRunJobService
    }, {
      emitter,
      toolConfirmationRequester,
      toolQuestionRequester,
      hostRenderSinks
    })
    this.registry.add(input.submissionId, run)
    return run
  }
}

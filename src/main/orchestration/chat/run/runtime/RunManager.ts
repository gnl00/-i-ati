import { resolveTelegramApprovalTargets } from '@main/services/telegram/TelegramApprovalTargets'
import type { RunOutcome, RunSubmissionOptions } from '../RunSubmissionOptions'
import { AbortError } from './errors'
import subagentRunService from '@main/services/subagent/subagent-run-service'
import { subagentRuntimeBridge } from '@main/services/subagent/subagent-runtime-bridge'
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
import type {
  ActiveChatRunIdentity,
  RunCancelRequest,
  RunCancelResult
} from '@shared/run/cancellation'

export type RunSubmissionHandle = {
  submissionId: string
  outcome: Promise<RunOutcome>
  completion: Promise<RunResult>
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

  submit(
    input: MainAgentRunInput,
    eventSinks: RunEventSink[] = [],
    hostRenderSinks: HostRenderEventSink[] = [],
    options: RunSubmissionOptions = {}
  ): RunSubmissionHandle {
    if (!input.submissionId?.trim()
      || !input.modelRef?.accountId?.trim()
      || !input.modelRef?.modelId?.trim()
      || typeof input.input?.textCtx !== 'string'
      || !Array.isArray(input.input.mediaCtx)) {
      throw new Error('Invalid run submission')
    }
    if (
      options.execution &&
      (!Number.isSafeInteger(options.execution.maxSteps) ||
        options.execution.maxSteps < 1)
    ) {
      throw new Error('Invalid run execution budget')
    }
    const run = this.createRun(input, eventSinks, hostRenderSinks, options)
    try {
      run.emitAccepted()
    } catch (error) {
      this.cancelPendingInteractions(input.submissionId)
      subagentRuntimeBridge.releaseParent(input.submissionId)
      this.registry.delete(input.submissionId)
      throw error
    }
    const onAbort = (): void => {
      this.cancel(input.submissionId)
    }
    options.signal?.addEventListener('abort', onAbort, { once: true })
    if (options.signal?.aborted) onAbort()
    const outcome = (async (): Promise<RunOutcome> => {
      try {
        const result = await run.run()
        if (result.state !== 'completed')
          subagentRunService.cancelForParent(input.submissionId)
        return { result, agentResult: run.agentResult }
      } catch (error) {
        subagentRunService.cancelForParent(input.submissionId)
        throw error
      } finally {
        options.signal?.removeEventListener('abort', onAbort)
        this.deps.toolConfirmationManager.cancelForSubmission(
          input.submissionId,
          'parent_finished',
          false
        )
        this.deps.toolQuestionManager?.cancelForSubmission(input.submissionId)
        subagentRuntimeBridge.releaseParent(input.submissionId)
        this.registry.delete(input.submissionId)
      }
    })()
    const completion = outcome.then(({ result }) => {
      if (result.state === 'aborted') throw new AbortError()
      if (result.state === 'failed') {
        const error = new Error(result.error?.message || 'Run failed')
        error.name = result.error?.name || 'Error'
        if (result.error?.stack) error.stack = result.error.stack
        throw error
      }
      return result
    })
    // The IPC caller only needs admission; observing rejection keeps its completion safe.
    void completion.catch(() => undefined)
    return { submissionId: input.submissionId, completion, outcome }
  }

  cancel(submissionId: string): RunCancelResult
  cancel(request: RunCancelRequest): RunCancelResult
  cancel(target: string | RunCancelRequest): RunCancelResult
  cancel(target: string | RunCancelRequest): RunCancelResult {
    const request: RunCancelRequest = typeof target === 'string'
      ? { submissionId: target }
      : target
    const submissionId = request.submissionId?.trim()
    const chatUuid = request.chatUuid?.trim()

    if (!submissionId && !chatUuid) {
      return { cancelled: false, reason: 'invalid_request' }
    }

    const run = submissionId
      ? this.registry.get(submissionId)
      : this.registry.getActiveRunForChat(chatUuid as string)
    if (!run) {
      if (submissionId) {
        this.cancelPendingInteractions(submissionId)
      }
      return { cancelled: false, reason: 'run_not_found' }
    }
    if (chatUuid && run.chatUuid !== chatUuid) {
      return { cancelled: false, reason: 'chat_mismatch' }
    }

    run.cancel()
    subagentRunService.cancelForParent(run.submissionId)
    this.cancelPendingInteractions(run.submissionId)
    return { cancelled: true, submissionId: run.submissionId }
  }

  getActiveRunIdentityForChat(chatUuid: string): ActiveChatRunIdentity | null {
    const run = this.registry.getActiveRunForChat(chatUuid)
    if (!run || !run.chatUuid) {
      return null
    }
    return {
      submissionId: run.submissionId,
      chatUuid: run.chatUuid
    }
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
      ...(input.textAttachments?.length ? { textAttachments: input.textAttachments } : {}),
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
    hostRenderSinks: HostRenderEventSink[] = [],
    options: RunSubmissionOptions = {}
  ): AgentRun {
    const emitter = this.deps.eventEmitterFactory.create({
      submissionId: input.submissionId,
      chatId: input.chatId,
      chatUuid: input.chatUuid
    }, eventSinks)
    const toolConfirmationRequester: ToolConfirmationRequester =
      options.toolConfirmationRequester ?? {
        request: (request) => this.deps.toolConfirmationManager.request(
          emitter,
          request,
          resolveTelegramApprovalTargets(emitter.chatUuid, input.input.host)
        )
      }
    const toolQuestionRequester: ToolQuestionRequester = {
      request: request => this.deps.toolQuestionManager
        ? this.deps.toolQuestionManager.request(emitter, request)
        : Promise.resolve({ status: 'unavailable', reason: 'User question manager unavailable' })
    }
    const run = new AgentRun(input, {
      mainAgentRuntimeRunner: this.deps.mainAgentRuntimeRunner,
      chatAgentAdapter: this.deps.chatAgentAdapter,
      postRunJobService: this.deps.postRunJobService
    }, {
        options,
        emitter,
      toolConfirmationRequester,
      toolQuestionRequester,
      hostRenderSinks
    })
    this.registry.add(input.submissionId, run)
    try {
      subagentRuntimeBridge.register(input.submissionId, {
        requester: toolConfirmationRequester,
        emitter,
        cancelConfirmation: subagentId => this.deps.toolConfirmationManager.cancelForSubagent(input.submissionId, subagentId)
      })
    } catch (error) {
      this.registry.delete(input.submissionId)
      throw error
    }
    return run
  }

  private cancelPendingInteractions(submissionId: string): void {
    this.deps.toolConfirmationManager.cancelForSubmission(submissionId)
    this.deps.toolQuestionManager?.cancelForSubmission(submissionId)
  }
}

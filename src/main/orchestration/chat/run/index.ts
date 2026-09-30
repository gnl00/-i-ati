import type { ToolConfirmationListener } from '@main/agent/contracts/ToolConfirmation'
import {
  type CompressionExecutionInput,
  type TitleGenerationInput
} from '@main/orchestration/chat/maintenance'
import type { RunEventSink } from '@main/agent/contracts'
import type { MainAgentRunInput } from '@main/hosts/chat/preparation/types'
import type { HostRenderEventSink } from '@main/hosts/shared/render'
import type { PermissionApprovalMode } from '@tools/approval'
import type { ToolConfirmationDecision } from './infrastructure'
import type {
  ToolConfirmationActor,
  ToolConfirmationSnapshot,
  ToolConfirmationSubmitResult
} from '@shared/tools/confirmation'
import type {
  PendingToolQuestion,
  ToolUserQuestionSubmitResult
} from '@shared/tools/userQuestion'
import type { RunSteerRequest, RunSteerResult } from '@shared/run/steering-events'
import type {
  ActiveChatRunIdentity,
  RunCancelRequest,
  RunCancelResult
} from '@shared/run/cancellation'
import { RunRuntimeFactory, type RunRuntimeDeps } from './runtime/RunRuntimeFactory'
import type { RunSubmissionHandle } from './runtime/RunManager'

type RunExecutionOptions = {
  eventSinks?: RunEventSink[]
  hostRenderSinks?: HostRenderEventSink[]
}

// All desktop entry points coordinate the same active runs and interactions.
let defaultRuntime: RunRuntimeDeps | undefined

export class RunService {
  private readonly runtime: RunRuntimeDeps

  constructor(runtime?: RunRuntimeDeps) {
    this.runtime = runtime ?? (defaultRuntime ??= new RunRuntimeFactory().create())
  }

  submit(
    input: MainAgentRunInput,
    options: RunExecutionOptions = {}
  ): RunSubmissionHandle {
    return this.runtime.runManager.submit(input, options.eventSinks, options.hostRenderSinks)
  }

  async executeCompression(data: CompressionExecutionInput): Promise<CompressionResult> {
    return await this.runtime.compressionExecutionService.execute(data)
  }

  async generateTitle(data: TitleGenerationInput): Promise<{ title: string }> {
    return await this.runtime.titleGenerationService.generate(data)
  }

  async waitForPostRunJobs(): Promise<void> {
    await this.runtime.postRunJobService.waitForIdle()
  }

  submitToolConfirmation(request: unknown, host: 'chat' | 'tui'): ToolConfirmationSubmitResult {
    return this.runtime.toolConfirmationManager.submit(request, { host })
  }

  submitTelegramToolConfirmation(
    confirmationId: string,
    decision: ToolConfirmationDecision,
    actor: Extract<ToolConfirmationActor, { host: 'telegram' }>
  ): ToolConfirmationSubmitResult {
    return this.runtime.toolConfirmationManager.submitTelegram(confirmationId, decision, actor)
  }

  subscribeToolConfirmations(listener: ToolConfirmationListener): () => void {
    return this.runtime.toolConfirmationManager.subscribe(listener)
  }

  getToolConfirmationSnapshot(chatUuid: string): ToolConfirmationSnapshot {
    return this.runtime.toolConfirmationManager.snapshot(chatUuid)
  }

  submitToolUserQuestion(request: unknown): ToolUserQuestionSubmitResult {
    return this.runtime.toolQuestionManager.submit(request)
  }

  listPendingToolUserQuestions(chatUuid: string): PendingToolQuestion[] {
    return this.runtime.toolQuestionManager.listPending(chatUuid)
  }

  cancel(submissionId: string): RunCancelResult
  cancel(request: RunCancelRequest): RunCancelResult
  cancel(target: string | RunCancelRequest): RunCancelResult
  cancel(target: string | RunCancelRequest): RunCancelResult {
    return this.runtime.runManager.cancel(target)
  }

  getActiveRunIdentityForChat(chatUuid: string): ActiveChatRunIdentity | null {
    return this.runtime.runManager.getActiveRunIdentityForChat(chatUuid)
  }

  steer(input: RunSteerRequest): RunSteerResult {
    return this.runtime.runManager.steer(input)
  }

  hasActiveRunForChat(chatUuid: string): boolean {
    return this.runtime.runManager.hasActiveRunForChat(chatUuid)
  }

  updatePermissionApprovalModeForChat(
    chatUuid: string,
    mode: PermissionApprovalMode
  ): boolean {
    return this.runtime.runManager.updateActiveRunPermissionApprovalMode(chatUuid, mode)
  }
}

export type { MainAgentRunInput } from '@main/hosts/chat/preparation/types'
export type { RunSubmissionHandle } from './runtime/RunManager'
export type { ToolConfirmationDecision } from './infrastructure'
export type {
  ActiveChatRunIdentity,
  RunCancelRequest,
  RunCancelResult
} from '@shared/run/cancellation'

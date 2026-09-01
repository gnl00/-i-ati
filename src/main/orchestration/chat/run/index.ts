import {
  type CompressionExecutionInput,
  type TitleGenerationInput
} from '@main/orchestration/chat/maintenance'
import type { RunEventSink, RunResult } from '@main/agent/contracts'
import type { MainAgentRunInput } from '@main/hosts/chat/preparation/types'
import type { HostRenderEventSink } from '@main/hosts/shared/render'
import type { PermissionApprovalMode } from '@tools/approval'
import type { ToolConfirmationDecision } from './infrastructure'
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

type RunExecutionOptions = {
  eventSinks?: RunEventSink[]
  hostRenderSinks?: HostRenderEventSink[]
}

export class RunService {
  private readonly runtime: RunRuntimeDeps

  constructor(runtime: RunRuntimeDeps = new RunRuntimeFactory().create()) {
    this.runtime = runtime
  }

  // Interactive entry: accept immediately and continue the run in the background.
  async start(
    input: MainAgentRunInput,
    options: RunExecutionOptions = {}
  ): Promise<{ accepted: true; submissionId: string }> {
    return await this.runtime.runManager.start(input, options.eventSinks, options.hostRenderSinks)
  }

  // Internal entry: execute the main run pipeline and wait for its terminal result,
  // but not asynchronous post-run jobs.
  async execute(input: MainAgentRunInput, options: RunExecutionOptions = {}): Promise<RunResult> {
    return await this.runtime.runManager.execute(input, options.eventSinks, options.hostRenderSinks)
  }

  async executeCompression(data: CompressionExecutionInput): Promise<CompressionResult> {
    return await this.runtime.compressionExecutionService.execute(data)
  }

  async generateTitle(data: TitleGenerationInput): Promise<{ title: string }> {
    return await this.runtime.titleGenerationService.generate(data)
  }

  resolveToolConfirmation(toolCallId: string, decision: ToolConfirmationDecision): void {
    this.runtime.toolConfirmationManager.resolve(toolCallId, decision)
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
export type { ToolConfirmationDecision } from './infrastructure'
export type {
  ActiveChatRunIdentity,
  RunCancelRequest,
  RunCancelResult
} from '@shared/run/cancellation'

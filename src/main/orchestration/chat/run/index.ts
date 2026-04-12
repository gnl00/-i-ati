import {
  type CompressionExecutionInput,
  type TitleGenerationInput
} from '@main/orchestration/chat/maintenance'
import type { RunResult } from '@main/agent/contracts'
import type { MainAgentRunInput } from '@main/hosts/chat/preparation/types'
import type { RunEventSink } from './infrastructure'
import type { ToolConfirmationDecision } from './infrastructure'
import { RunRuntimeFactory, type RunRuntimeDeps } from './runtime/RunRuntimeFactory'

type RunExecutionOptions = {
  eventSinks?: RunEventSink[]
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
    return await this.runtime.runManager.start(input, options.eventSinks)
  }

  // Internal entry: execute the main run pipeline and wait for its terminal result,
  // but not asynchronous post-run jobs.
  async execute(input: MainAgentRunInput, options: RunExecutionOptions = {}): Promise<RunResult> {
    return await this.runtime.runManager.execute(input, options.eventSinks)
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

  cancel(submissionId: string): void {
    this.runtime.runManager.cancel(submissionId)
  }

  hasActiveRunForChat(chatUuid: string): boolean {
    return this.runtime.runManager.hasActiveRunForChat(chatUuid)
  }
}

export type { MainAgentRunInput } from '@main/hosts/chat/preparation/types'
export type { ToolConfirmationDecision } from './infrastructure'

import {
  type ChatCompressionExecuteInput,
  type ChatTitleGenerateInput
} from '@main/services/chatOperations'
import type { RunResult } from '@main/services/agentCore/types'
import type { MainChatRunInput } from '@main/services/hostAdapters/chat'
import type { ToolConfirmationDecision } from './infrastructure'
import { ChatRunRuntimeFactory, type ChatRunRuntime } from './runtime/ChatRunRuntimeFactory'

export class ChatRunService {
  private readonly runtime: ChatRunRuntime

  constructor(runtime: ChatRunRuntime = new ChatRunRuntimeFactory().create()) {
    this.runtime = runtime
  }

  // Interactive entry: accept immediately and continue the run in the background.
  async start(input: MainChatRunInput): Promise<{ accepted: true; submissionId: string }> {
    return await this.runtime.runManager.start(input)
  }

  // Internal entry: execute the main run pipeline and wait for its terminal result,
  // but not asynchronous post-run jobs.
  async execute(input: MainChatRunInput): Promise<RunResult> {
    return await this.runtime.runManager.execute(input)
  }

  async executeCompression(data: ChatCompressionExecuteInput): Promise<CompressionResult> {
    return await this.runtime.compressionExecutionService.execute(data)
  }

  async generateTitle(data: ChatTitleGenerateInput): Promise<{ title: string }> {
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

export type { MainChatRunInput } from '@main/services/hostAdapters/chat'
export type { ToolConfirmationDecision } from './infrastructure'

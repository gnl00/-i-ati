import type { ToolConfirmationRequester } from '@main/services/agent/contracts'
import { AbortError } from './errors'
import { ChatAgentAdapter } from '@main/services/hostAdapters/chat/ChatAgentAdapter'
import type { MainChatRunInput } from '@main/services/hostAdapters/chat/preparation/types'
import type { ChatRunEventEmitter } from '../infrastructure'
import { PostRunJobService } from '@main/services/chatPostRun'
import type { RunResult } from '@main/services/agent/contracts'
import { RunLifecycleEventMapper } from './RunLifecycleEventMapper'
import { RunTerminalHandler } from './RunTerminalHandler'
import { serializeError } from '@main/services/serializeError'
import type { MainAgentRuntimeRunner } from './MainAgentRuntimeRunner'

export type AgentRunServices = {
  mainAgentRuntimeRunner: MainAgentRuntimeRunner
  chatAgentAdapter: ChatAgentAdapter
  postRunJobService: PostRunJobService
}

export type AgentRunRuntime = {
  emitter: ChatRunEventEmitter
  toolConfirmationRequester: ToolConfirmationRequester
}

export class AgentRun {
  readonly submissionId: string
  readonly chatUuid?: string
  readonly controller = new AbortController()
  readonly emitter: ChatRunEventEmitter
  private readonly lifecycle: RunLifecycleEventMapper
  private readonly terminalHandler = new RunTerminalHandler()

  constructor(
    private readonly input: MainChatRunInput,
    private readonly services: AgentRunServices,
    private readonly runtime: AgentRunRuntime
  ) {
    this.submissionId = input.submissionId
    this.chatUuid = input.chatUuid
    this.emitter = runtime.emitter
    this.lifecycle = new RunLifecycleEventMapper(runtime.emitter)
  }

  emitAccepted(): void {
    this.lifecycle.emitAccepted(this.input.submissionId)
  }

  cancel(): void {
    if (!this.controller.signal.aborted) {
      this.controller.abort()
    }
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

      const runResult = await this.services.mainAgentRuntimeRunner.run({
        runInput: this.input,
        prepared: { runSpec, chatContext },
        emitter: this.emitter,
        signal: this.controller.signal,
        toolConfirmationRequester: this.runtime.toolConfirmationRequester
      })

      return await this.terminalHandler.handleRuntimeResult({
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

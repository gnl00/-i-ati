import type { ToolConfirmationRequester } from '@main/services/agentCore/ports'
import { AbortError } from './errors'
import { AgentRunKernel } from '@main/services/agentCore/run-kernel'
import {
  ChatAgentAdapter,
  AssistantStepFactory,
  type MainChatRunInput
} from '@main/services/hostAdapters/chat'
import type { ChatRunEventEmitter } from '../infrastructure'
import { PostRunJobService } from '@main/services/chatPostRun'
import type { RunResult } from '@main/services/agentCore/types'
import { RunLifecycleEventMapper } from './RunLifecycleEventMapper'
import { RunTerminalHandler } from './RunTerminalHandler'
import { serializeError } from '@main/services/serializeError'
import type { MainAgentNextRuntimeRunner } from './next'

export type AgentRunServices = {
  agentRunKernel: AgentRunKernel
  assistantStepFactory: AssistantStepFactory
  chatAgentAdapter: ChatAgentAdapter
  postRunJobService: PostRunJobService
  mainAgentNextRuntimeRunner?: MainAgentNextRuntimeRunner
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

      if (this.services.mainAgentNextRuntimeRunner) {
        const nextResult = await this.services.mainAgentNextRuntimeRunner.run({
          runInput: this.input,
          prepared: { runSpec, chatContext },
          emitter: this.emitter,
          signal: this.controller.signal,
          toolConfirmationRequester: this.runtime.toolConfirmationRequester
        })

        return await this.terminalHandler.handleKernelResult({
          input: this.input,
          kernelResult: nextResult.kernelResult,
          runSpec,
          chatContext,
          emitter: this.emitter,
          chatAgentAdapter: this.services.chatAgentAdapter,
          postRunJobService: this.services.postRunJobService,
          stepCommitter: nextResult.uiAdapter
        })
      }

      const stepContext = this.services.chatAgentAdapter.createStepRuntimeContext(chatContext)

      const step = this.services.assistantStepFactory.create({
        runSpec,
        stepContext,
        signal: this.controller.signal,
        emitter: this.emitter,
        toolConfirmationRequester: this.runtime.toolConfirmationRequester
      })

      const kernelResult = await this.services.agentRunKernel.run(() => step.loop.execute())
      return await this.terminalHandler.handleKernelResult({
        input: this.input,
        kernelResult,
        runSpec,
        chatContext,
        emitter: this.emitter,
        chatAgentAdapter: this.services.chatAgentAdapter,
        postRunJobService: this.services.postRunJobService,
        stepCommitter: step.stepCommitter
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

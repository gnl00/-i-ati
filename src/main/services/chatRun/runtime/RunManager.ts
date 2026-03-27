import { AbortError } from '../errors'
import type { ToolConfirmationRequester } from '@main/services/agentCore/contracts'
import { AgentRunKernel } from '@main/services/agentCore/run-kernel'
import { AgentRun } from './AgentRun'
import { PostRunJobService } from '@main/services/chatPostRun'
import {
  ChatAgentAdapter,
  AssistantStepFactory,
  type MainChatRunInput
} from '@main/services/hostAdapters/chat'
import type { RunResult } from '@main/services/agentCore/types'
import type {
  ChatRunEventEmitterFactory,
  ChatRunEventSink,
  ToolConfirmationManager
} from '../infrastructure'
import { RunRegistry } from './RunRegistry'

type StartChatRunResult = {
  accepted: true
  submissionId: string
}

export type RunManagerDependencies = {
  toolConfirmationManager: ToolConfirmationManager
  eventEmitterFactory: ChatRunEventEmitterFactory
  agentRunKernel: AgentRunKernel
  chatAgentAdapter: ChatAgentAdapter
  assistantStepFactory: AssistantStepFactory
  postRunJobService: PostRunJobService
}

export class RunManager {
  private readonly registry = new RunRegistry()

  constructor(private readonly deps: RunManagerDependencies) {}

  // Fire-and-forget entry used by the interactive chat flow.
  async start(input: MainChatRunInput, eventSinks: ChatRunEventSink[] = []): Promise<StartChatRunResult> {
    const run = this.createRun(input, eventSinks)
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
  async execute(input: MainChatRunInput, eventSinks: ChatRunEventSink[] = []): Promise<RunResult> {
    const run = this.createRun(input, eventSinks)
    run.emitAccepted()

    try {
      const result = await run.run()
      if (result.state === 'aborted') {
        throw new AbortError()
      }
      if (result.state === 'failed') {
        const error = new Error(result.error?.message || 'Chat run failed')
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
      return
    }
    run.cancel()
    this.registry.delete(submissionId)
  }

  hasActiveRunForChat(chatUuid: string): boolean {
    return this.registry.hasActiveRunForChat(chatUuid)
  }

  private createRun(input: MainChatRunInput, eventSinks: ChatRunEventSink[] = []): AgentRun {
    const emitter = this.deps.eventEmitterFactory.create({
      submissionId: input.submissionId
    }, eventSinks)
    const toolConfirmationRequester: ToolConfirmationRequester = {
      request: (request) => this.deps.toolConfirmationManager.request(emitter, request)
    }
    const run = new AgentRun(input, {
      agentRunKernel: this.deps.agentRunKernel,
      assistantStepFactory: this.deps.assistantStepFactory,
      chatAgentAdapter: this.deps.chatAgentAdapter,
      postRunJobService: this.deps.postRunJobService,
    }, {
      emitter,
      toolConfirmationRequester
    })
    this.registry.add(input.submissionId, run)
    return run
  }
}

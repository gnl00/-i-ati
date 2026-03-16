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
import type { ChatRunEventEmitterFactory, ToolConfirmationManager } from '../infrastructure'
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
  async start(input: MainChatRunInput): Promise<StartChatRunResult> {
    const run = this.createRun(input)
    run.emitAccepted()
    void run.run().catch(() => undefined).finally(() => {
      this.registry.delete(input.submissionId)
    })

    return {
      accepted: true,
      submissionId: input.submissionId
    }
  }

  // Wait for the main run pipeline to finish, but not post-run jobs like title/compression.
  async runBlocking(input: MainChatRunInput): Promise<RunResult> {
    const run = this.createRun(input)
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

  private createRun(input: MainChatRunInput): AgentRun {
    const emitter = this.deps.eventEmitterFactory.create({
      submissionId: input.submissionId
    })
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

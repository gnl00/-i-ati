import { AbortError } from './errors'
import type { ToolConfirmationRequester } from '@main/agent/contracts'
import { AgentRun } from './AgentRun'
import { PostRunJobService } from '@main/orchestration/chat/postRun'
import { ChatAgentAdapter } from '@main/hosts/chat/ChatAgentAdapter'
import type { MainAgentRunInput } from '@main/hosts/chat/preparation/types'
import type { HostRenderEventSink } from '@main/hosts/shared/render'
import type { RunResult } from '@main/agent/contracts'
import type {
  RunEventEmitterFactory,
  RunEventSink,
  ToolConfirmationManager
} from '../infrastructure'
import { RunRegistry } from './RunRegistry'
import type { MainAgentRuntimeRunner } from './MainAgentRuntimeRunner'

type StartRunResult = {
  accepted: true
  submissionId: string
}

export type RunManagerDependencies = {
  toolConfirmationManager: ToolConfirmationManager
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
      return
    }
    run.cancel()
    this.registry.delete(submissionId)
  }

  hasActiveRunForChat(chatUuid: string): boolean {
    return this.registry.hasActiveRunForChat(chatUuid)
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
    const run = new AgentRun(input, {
      mainAgentRuntimeRunner: this.deps.mainAgentRuntimeRunner,
      chatAgentAdapter: this.deps.chatAgentAdapter,
      postRunJobService: this.deps.postRunJobService
    }, {
      emitter,
      toolConfirmationRequester,
      hostRenderSinks
    })
    this.registry.add(input.submissionId, run)
    return run
  }
}

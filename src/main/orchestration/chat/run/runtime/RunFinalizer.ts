import type { RunResult } from '@main/agent/contracts'
import type { ChatAgentAdapter } from '@main/hosts/chat/ChatAgentAdapter'
import type { PostRunJobService } from '@main/orchestration/chat/postRun'
import type { MainAgentRunInput } from '@main/hosts/chat/preparation/types'
import type { RunEventEmitter } from '../infrastructure'
import type { MainAgentRuntimeTerminalResult } from './MainAgentRuntimeResult'
import { RunLifecycleEventMapper } from './RunLifecycleEventMapper'

type HandleRuntimeResultArgs = {
  input: MainAgentRunInput
  runtimeResult: MainAgentRuntimeTerminalResult
  runSpec: any
  chatContext: any
  emitter: RunEventEmitter
  chatAgentAdapter: ChatAgentAdapter
  postRunJobService: PostRunJobService
  stepCommitter: {
    getFinalAssistantMessage(): MessageEntity
    getLastUsage(): ITokenUsage | undefined
  }
}

export class RunFinalizer {
  async handleRuntimeResult(args: HandleRuntimeResultArgs): Promise<RunResult> {
    const {
      input,
      runtimeResult,
      runSpec,
      chatContext,
      emitter,
      chatAgentAdapter,
      postRunJobService,
      stepCommitter
    } = args
    const lifecycle = new RunLifecycleEventMapper(emitter)

    if (runtimeResult.state === 'aborted') {
      await chatAgentAdapter.abortRun({
        chatContext,
        stepCommitter
      })
      lifecycle.emitAborted()
      return { state: 'aborted' }
    }

    if (runtimeResult.state === 'failed') {
      lifecycle.emitFailed(runtimeResult.error)
      return {
        state: 'failed',
        error: runtimeResult.error
      }
    }

    lifecycle.emitFinalizing()
    const finalizeResult = await chatAgentAdapter.finalizeRun({
      input,
      runSpec,
      chatContext,
      stepResult: runtimeResult.stepResult,
      emitter,
      stepCommitter
    })
    const postRunPlan = postRunJobService.getPlan(finalizeResult.postRunInput)
    const assistantMessageId = finalizeResult.runResult.assistantMessageId ?? -1
    if (postRunPlan) {
      postRunJobService.emitPlan(finalizeResult.postRunInput, postRunPlan)
    }
    lifecycle.emitCompleted(assistantMessageId, finalizeResult.runResult.usage)
    void postRunJobService.run(finalizeResult.postRunInput, postRunPlan)

    return finalizeResult.runResult
  }
}

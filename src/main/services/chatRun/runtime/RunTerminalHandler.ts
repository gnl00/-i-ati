import type { RunResult } from '@main/services/agent/contracts'
import type { ChatAgentAdapter } from '@main/services/hostAdapters/chat/ChatAgentAdapter'
import type { PostRunJobService } from '@main/services/chatPostRun'
import type { MainChatRunInput } from '@main/services/hostAdapters/chat/preparation/types'
import type { ChatRunEventEmitter } from '../infrastructure'
import type { MainAgentRuntimeTerminalResult } from './MainAgentRuntimeResult'
import { RunLifecycleEventMapper } from './RunLifecycleEventMapper'

type HandleRuntimeResultArgs = {
  input: MainChatRunInput
  runtimeResult: MainAgentRuntimeTerminalResult
  runSpec: any
  chatContext: any
  emitter: ChatRunEventEmitter
  chatAgentAdapter: ChatAgentAdapter
  postRunJobService: PostRunJobService
  stepCommitter: {
    getFinalAssistantMessage(): MessageEntity
    getLastUsage(): ITokenUsage | undefined
  }
}

export class RunTerminalHandler {
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

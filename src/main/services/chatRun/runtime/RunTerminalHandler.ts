import type { AgentRunKernelResult } from '@main/services/agentCore/run-kernel'
import type { RunResult } from '@main/services/agentCore/types'
import type { ChatAgentAdapter } from '@main/services/hostAdapters/chat'
import type { PostRunJobService } from '@main/services/chatPostRun'
import type { MainChatRunInput } from '@main/services/hostAdapters/chat'
import type { ChatRunEventEmitter } from '../infrastructure'
import { RunLifecycleEventMapper } from './RunLifecycleEventMapper'

type HandleKernelResultArgs = {
  input: MainChatRunInput
  kernelResult: AgentRunKernelResult
  runSpec: any
  chatContext: any
  emitter: ChatRunEventEmitter
  chatAgentAdapter: ChatAgentAdapter
  postRunJobService: PostRunJobService
  messageManager: {
    flushPendingAssistantUpdate(): void
    getLastAssistantMessage(): MessageEntity
    getLastUsage(): ITokenUsage | undefined
  }
}

export class RunTerminalHandler {
  async handleKernelResult(args: HandleKernelResultArgs): Promise<RunResult> {
    const {
      input,
      kernelResult,
      runSpec,
      chatContext,
      emitter,
      chatAgentAdapter,
      postRunJobService,
      messageManager
    } = args
    const lifecycle = new RunLifecycleEventMapper(emitter)

    if (kernelResult.state === 'aborted') {
      await chatAgentAdapter.abortRun({
        chatContext,
        messageManager
      })
      lifecycle.emitAborted()
      return { state: 'aborted' }
    }

    if (kernelResult.state === 'failed') {
      lifecycle.emitFailed(kernelResult.error)
      return {
        state: 'failed',
        error: kernelResult.error
      }
    }

    lifecycle.emitFinalizing()
    const finalizeResult = await chatAgentAdapter.finalizeRun({
      input,
      runSpec,
      chatContext,
      stepResult: kernelResult.stepResult,
      emitter,
      messageManager
    })
    const assistantMessageId = finalizeResult.runResult.assistantMessageId ?? -1
    lifecycle.emitCompleted(assistantMessageId, finalizeResult.runResult.usage)
    void postRunJobService.run(finalizeResult.postRunInput)

    return finalizeResult.runResult
  }
}

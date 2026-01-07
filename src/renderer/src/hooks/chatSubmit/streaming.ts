import { MessageManager } from './streaming/message-manager'
import { StreamingOrchestrator } from './streaming/orchestrator'
import { ChunkParser } from './streaming/parser'
import type {
  PreparedRequest,
  SendRequestStage,
  StreamingContext,
  StreamingDeps,
  StreamingFactoryCallbacks,
  StreamingState
} from './types'

const createInitialStreamingState = (): StreamingState => ({
  tools: {
    hasToolCall: false,
    toolCalls: [],
    toolCallResults: []
  }
})


type StreamingPhase = 'idle' | 'receiving' | 'toolCall' | 'completed'

class StreamingSessionMachine {
  private readonly context: StreamingContext
  private phase: StreamingPhase = 'idle'
  private readonly parser: ChunkParser
  private readonly messageManager: MessageManager
  private readonly orchestrator: StreamingOrchestrator

  constructor(
    requestReady: PreparedRequest,
    private readonly deps: StreamingDeps,
    private readonly callbacks?: StreamingFactoryCallbacks
  ) {
    // 1. 初始化 context
    this.context = {
      ...requestReady,
      streaming: createInitialStreamingState()
    }

    // 2. 创建依赖
    this.parser = new ChunkParser()
    this.messageManager = new MessageManager(this.context, deps.store)

    // 3. 创建 orchestrator
    this.orchestrator = new StreamingOrchestrator({
      context: this.context,
      deps: this.deps,
      parser: this.parser,
      messageManager: this.messageManager,
      signal: this.context.control.signal,
      callbacks: {
        onPhaseChange: (phase) => {
          if (phase === 'receiving') {
            this.transition('receiving')
          } else if (phase === 'toolCall') {
            this.transition('toolCall')
          }
        }
      }
    })
  }

  private transition(phase: StreamingPhase) {
    if (this.phase === phase) return
    this.phase = phase
    if (phase === 'receiving') {
      this.callbacks?.onStateChange('streaming')
    } else if (phase === 'toolCall') {
      this.callbacks?.onStateChange('toolCall')
    } else if (phase === 'completed') {
      this.deps.setShowLoadingIndicator(false)
    }
  }

  async start(): Promise<StreamingContext> {
    // 只需调用一次，Orchestrator 内部会循环
    await this.orchestrator.execute()

    this.transition('completed')
    return this.context
  }
}

export const createStreamingV2 = (deps: StreamingDeps): SendRequestStage => {
  const sendRequest: SendRequestStage = async (requestReady, callbacks) => {
    const machine = new StreamingSessionMachine(requestReady, deps, callbacks)
    return machine.start()
  }

  return sendRequest
}

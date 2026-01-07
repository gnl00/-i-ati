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
  isContentHasThinkTag: false,
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
    this.messageManager = new MessageManager(this.context, deps.setMessages)

    // 3. 创建 orchestrator
    this.orchestrator = new StreamingOrchestrator({
      context: this.context,
      deps: this.deps,
      parser: this.parser,
      messageManager: this.messageManager,
      signal: this.context.control.signal
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
    while (true) {
      this.transition('receiving')
      await this.orchestrator.executeRequestCycle()

      if (this.context.streaming.tools.hasToolCall &&
        this.context.streaming.tools.toolCalls.length > 0) {
        this.transition('toolCall')
        // 工具调用已在 executeRequestCycle 中处理
      } else {
        break
      }
    }

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

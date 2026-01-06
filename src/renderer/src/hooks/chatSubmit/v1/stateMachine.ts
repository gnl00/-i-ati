import { createPipelineBuilder } from './builder'
import { BuildRequestParams, PipelineBuilder, PrepareMessageFn, PrepareMessageParams, PreparedChat, RequestReadyChat, StreamingContext } from './types'

export type ChatMachineStatus =
  | 'idle'
  | 'preparing'
  | 'streaming'
  | 'toolCall'
  | 'finalizing'
  | 'completed'
  | 'error'
  | 'cancelled'

export interface ChatMachineSnapshot {
  status: ChatMachineStatus
  context?: PreparedChat | RequestReadyChat | StreamingContext
  error?: Error
}

interface StreamingCallbacks {
  onStateChange: (state: 'streaming' | 'toolCall') => void
}

export interface ChatPipelineMachineDeps {
  prepare: PrepareMessageFn
  buildRequest: (params: BuildRequestParams) => RequestReadyChat
  createStreamingPipeline: (callbacks: StreamingCallbacks) => {
    runPipeline: (context: RequestReadyChat) => Promise<StreamingContext>
  }
  finalize: (builder: PipelineBuilder) => Promise<void>
}

interface StartPayload {
  prepareParams: PrepareMessageParams
  prompt: string
}

export class ChatPipelineMachine {
  private snapshot: ChatMachineSnapshot = { status: 'idle' }
  private listeners = new Set<(snapshot: ChatMachineSnapshot) => void>()
  private pipeline = createPipelineBuilder()
  private isRunning = false

  constructor(private readonly deps: ChatPipelineMachineDeps) { }

  subscribe(listener: (snapshot: ChatMachineSnapshot) => void) {
    this.listeners.add(listener)
    listener(this.snapshot)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(status: ChatMachineStatus, error?: Error) {
    this.snapshot = { status, context: this.pipeline.getLatestContext(), error }
    this.listeners.forEach(listener => listener(this.snapshot))
  }

  getSnapshot() {
    return this.snapshot
  }

  private ensureIdle() {
    if (this.isRunning) {
      throw new Error('Chat pipeline is already running')
    }
  }

  async start(payload: StartPayload) {
    this.ensureIdle()
    this.isRunning = true
    this.pipeline = createPipelineBuilder()

    try {
      const prepared = await this.deps.prepare(payload.prepareParams)
      this.pipeline.withPrepared(prepared)
      this.emit('preparing')

      const requestReady = this.deps.buildRequest({
        prepared,
        prompt: payload.prompt
      })
      this.pipeline.withRequestReady(requestReady)

      const streaming = this.deps.createStreamingPipeline({
        onStateChange: (state) => this.emit(state)
      })
      this.emit('streaming')

      const streamingContext = await streaming.runPipeline(requestReady)
      this.pipeline.withStreaming(streamingContext)

      this.emit('finalizing')
      await this.deps.finalize(this.pipeline)

      this.emit('completed')
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        this.emit('cancelled', error)
      } else {
        this.emit('error', error)
      }
      throw error
    } finally {
      this.isRunning = false
    }
  }

  cancel() {
    const controller = this.pipeline.getAbortController()
    if (!controller) return
    try {
      controller.abort()
      this.emit('cancelled', new DOMException('Request aborted', 'AbortError'))
    } catch (error) {
      this.emit('error', error as Error)
      throw error
    }
  }
}

import { createPipelineBuilderV2 } from './builder'
import {
  ChatPipelineMachineSnapshot,
  ChatPipelineMachineStatus,
  ChatPipelineMachineV2Deps,
  ChatPipelineMachineV2StartPayload
} from './types'
import { AbortError } from './errors'

export class ChatPipelineMachineV2 {
  private snapshot: ChatPipelineMachineSnapshot = { status: 'idle' }
  private listeners = new Set<(snapshot: ChatPipelineMachineSnapshot) => void>()
  private builder = createPipelineBuilderV2()
  private isRunning = false

  constructor(private readonly deps: ChatPipelineMachineV2Deps) { }

  subscribe(listener: (snapshot: ChatPipelineMachineSnapshot) => void) {
    this.listeners.add(listener)
    listener(this.snapshot)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(status: ChatPipelineMachineStatus, error?: Error) {
    this.snapshot = {
      status,
      context: this.builder.getLatestContext(),
      error
    }
    this.listeners.forEach(listener => listener(this.snapshot))
  }

  private ensureIdle() {
    if (this.isRunning) {
      throw new Error('Chat pipeline is already running')
    }
  }

  async start(payload: ChatPipelineMachineV2StartPayload) {
    this.ensureIdle()
    this.isRunning = true
    this.builder = createPipelineBuilderV2()

    try {
      this.emit('preparing')
      const prepared = await this.deps.prepare(payload.prepareParams)
      this.builder.withStage('prepared', prepared)

      this.emit('requesting')
      const requestReady = await this.deps.buildRequest({
        prepared
      })
      this.builder.withStage('requestReady', requestReady)

      this.emit('streaming')
      const streamingContext = await this.deps.sendRequest(requestReady, {
        onStateChange: (state) => this.emit(state)
      })
      this.builder.withStage('streaming', streamingContext)

      this.emit('finalizing')
      await this.deps.finalize(this.builder, payload.finalizeDeps)

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
    const controller = this.builder.getAbortController()
    if (!controller) return
    try {
      controller.abort()
      this.emit('cancelled', new AbortError())
    } catch (error) {
      this.emit('error', error as Error)
      throw error
    }
  }
}

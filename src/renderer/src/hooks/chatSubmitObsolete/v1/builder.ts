import { PipelineBuilder, PipelineState, PreparedChat, RequestReadyChat, StreamingContext } from './types'

export const createPipelineBuilder = (initialState?: PipelineState): PipelineBuilder => {
  const state: PipelineState = initialState ? { ...initialState } : {}

  const builder: PipelineBuilder = {
    state,
    withPrepared(prepared: PreparedChat) {
      state.prepared = prepared
      return builder
    },
    withRequestReady(requestReady: RequestReadyChat) {
      state.requestReady = requestReady
      return builder
    },
    withStreaming(streaming: StreamingContext) {
      state.streaming = streaming
      return builder
    },
    getLatestContext() {
      return state.streaming || state.requestReady || state.prepared
    },
    getAbortController() {
      return state.streaming?.control.controller
        || state.requestReady?.control.controller
        || state.prepared?.control.controller
    },
    requireStreamingContext() {
      if (!state.streaming) {
        throw new Error('Streaming context is required but missing')
      }
      return state.streaming
    }
  }

  return builder
}

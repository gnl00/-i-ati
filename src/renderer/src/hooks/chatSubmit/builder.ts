import { PipelineBuilderState, PipelineBuilderV2, StageKey, StageOutputMap } from './types'

const cloneStage = <K extends StageKey>(value: StageOutputMap[K]): StageOutputMap[K] => {
  return Array.isArray(value)
    ? ([...value] as StageOutputMap[K])
    : { ...value }
}

export const createPipelineBuilderV2 = (initialState?: PipelineBuilderState): PipelineBuilderV2 => {
  const state: PipelineBuilderState = initialState ? { ...initialState } : {}

  const builder: PipelineBuilderV2 = {
    get state() {
      return state
    },
    withStage(stage, value) {
      state[stage] = value
      return builder
    },
    getStage(stage) {
      return state[stage]
    },
    requireStage(stage) {
      const stageValue = state[stage]
      if (!stageValue) {
        throw new Error(`Stage "${stage}" has not been initialized`)
      }
      return stageValue
    },
    updateStage(stage, reducer) {
      const snapshot = builder.requireStage(stage)
      const updated = reducer(cloneStage(snapshot))
      state[stage] = updated
      return builder
    },
    requireStreamingContext() {
      return builder.requireStage('streaming')
    },
    getLatestContext() {
      return state.streaming || state.requestReady || state.prepared
    },
    getAbortController() {
      return state.streaming?.control.controller
        || state.requestReady?.control.controller
        || state.prepared?.control.controller
    },
    snapshot() {
      return { ...state }
    }
  }

  return builder
}

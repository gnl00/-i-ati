import type { AgentStep } from '../step/AgentStep'
import type { LoopExecutionConfig } from './LoopExecutionConfig'
import type { ToolResultFact } from '../tools/ToolResultFact'

export interface LoopBudgetState {
  softMaxSteps: number
  hardMaxSteps: number
  extensionStepSize: number
}

export interface LoopBudgetProgressSignal {
  kind: 'tool_call' | 'tool_result'
}

export interface LoopBudgetPolicy {
  initialize(config?: LoopExecutionConfig): LoopBudgetState
  canStartStep(stepIndex: number, state: LoopBudgetState): boolean
  extendForProgress(
    state: LoopBudgetState,
    input: {
      step: AgentStep
      signals: LoopBudgetProgressSignal[]
      toolResults?: ToolResultFact[]
    }
  ): LoopBudgetState
}

const DEFAULT_SOFT_MAX_STEPS = 10
const DEFAULT_HARD_MAX_STEPS = 25
const DEFAULT_EXTENSION_STEP_SIZE = 5

const clampPositiveInteger = (value: number | undefined, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback
  }
  return Math.floor(value)
}

export class DefaultLoopBudgetPolicy implements LoopBudgetPolicy {
  initialize(config?: LoopExecutionConfig): LoopBudgetState {
    const hardMaxSteps = clampPositiveInteger(
      config?.hardMaxSteps ?? config?.maxSteps,
      DEFAULT_HARD_MAX_STEPS
    )
    const softMaxSteps = Math.min(
      clampPositiveInteger(config?.softMaxSteps, DEFAULT_SOFT_MAX_STEPS),
      hardMaxSteps
    )
    const extensionStepSize = clampPositiveInteger(
      config?.extensionStepSize,
      DEFAULT_EXTENSION_STEP_SIZE
    )

    return {
      softMaxSteps,
      hardMaxSteps,
      extensionStepSize
    }
  }

  canStartStep(stepIndex: number, state: LoopBudgetState): boolean {
    return stepIndex < state.softMaxSteps && stepIndex < state.hardMaxSteps
  }

  extendForProgress(
    state: LoopBudgetState,
    input: {
      step: AgentStep
      signals: LoopBudgetProgressSignal[]
      toolResults?: ToolResultFact[]
    }
  ): LoopBudgetState {
    if (state.softMaxSteps >= state.hardMaxSteps) {
      return state
    }

    if (!this.hasProgressSignal(input)) {
      return state
    }

    return {
      ...state,
      softMaxSteps: Math.min(
        state.hardMaxSteps,
        state.softMaxSteps + state.extensionStepSize
      )
    }
  }

  private hasProgressSignal(input: {
    step: AgentStep
    signals: LoopBudgetProgressSignal[]
    toolResults?: ToolResultFact[]
  }): boolean {
    if (input.signals.length > 0) {
      return true
    }

    if (input.step.toolCalls.length > 0) {
      return true
    }

    return Boolean(input.toolResults?.length)
  }
}

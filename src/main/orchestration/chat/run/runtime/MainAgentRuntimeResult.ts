import type { StepResult } from '@main/agent/contracts'
import type { SerializedError } from '@shared/run/lifecycle-events'

export type MainAgentRuntimeTerminalResult =
  | {
      state: 'completed'
      stepResult: StepResult
    }
  | {
      state: 'aborted'
    }
  | {
      state: 'failed'
      error: SerializedError
    }

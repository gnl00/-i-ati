import type { StepResult } from '@main/services/agent/contracts'
import type { SerializedError } from '@shared/chatRun/events'

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

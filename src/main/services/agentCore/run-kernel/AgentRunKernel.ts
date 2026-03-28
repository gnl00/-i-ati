import type { SerializedError } from '@shared/chatRun/events'
import { serializeError } from '@main/services/serializeError'
import type { StepResult } from '../types'

export type AgentRunKernelResult =
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

export class AgentRunKernel {
  async run(executeStep: () => Promise<StepResult>): Promise<AgentRunKernelResult> {
    try {
      const stepResult = await executeStep()
      return {
        state: 'completed',
        stepResult
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        return {
          state: 'aborted'
        }
      }

      return {
        state: 'failed',
        error: serializeError(error)
      }
    }
  }
}

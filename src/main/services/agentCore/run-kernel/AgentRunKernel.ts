import type { SerializedError } from '@shared/chatRun/events'
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

const serializeError = (error: any, depth: number = 0): SerializedError => {
  const serialized: SerializedError = {
    name: error?.name || 'Error',
    message: error?.message || 'Unknown error',
    stack: error?.stack as string | undefined,
    code: typeof error?.code === 'string' ? error.code : undefined
  }

  if (depth >= 3 || !error?.cause) {
    return serialized
  }

  return {
    ...serialized,
    cause: serializeError(error.cause, depth + 1)
  }
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

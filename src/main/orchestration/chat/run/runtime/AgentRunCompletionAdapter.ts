import type { StepResult } from '@main/agent/contracts'
import type { AgentLoopFailureInfo, AgentLoopResult } from '@main/agent/runtime/loop/AgentLoopResult'
import type { MainAgentRuntimeTerminalResult } from './MainAgentRuntimeResult'
import type { SerializedError } from '@shared/run/lifecycle-events'

export interface AgentRunCompletionAdapterInput {
  result: AgentLoopResult
}

export interface AgentRunCompletionAdapter {
  adapt(input: AgentRunCompletionAdapterInput): MainAgentRuntimeTerminalResult
}

const failureToSerializedError = (failure: AgentLoopFailureInfo): SerializedError => ({
  name: failure.name || 'Error',
  message: failure.message,
  code: failure.code,
  cause: failure.cause ? failureToSerializedError(failure.cause) : undefined
})

export class DefaultAgentRunCompletionAdapter implements AgentRunCompletionAdapter {
  adapt(input: AgentRunCompletionAdapterInput): MainAgentRuntimeTerminalResult {
    if (input.result.status === 'completed') {
      const stepResult: StepResult = {
        usage: input.result.usage ?? input.result.finalStep.usage
      }

      return {
        state: 'completed',
        stepResult
      }
    }

    if (input.result.status === 'aborted') {
      return {
        state: 'aborted'
      }
    }

    return {
      state: 'failed',
      error: failureToSerializedError(input.result.failure)
    }
  }
}

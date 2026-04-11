import type { AgentRunKernelResult } from '@main/services/agentCore/run-kernel'
import type { StepArtifact, StepResult } from '@main/services/agentCore/types'
import type { AgentLoopResult } from '@main/services/next/loop/AgentLoopResult'
import { partsToUnifiedContent } from '@main/services/next/runtime/model/ExecutableRequestAdapter'
import type { AgentTranscriptSnapshot } from '@main/services/next/transcript/AgentTranscript'
import { serializeError } from '@main/services/serializeError'

const transcriptToMessages = (transcript: AgentTranscriptSnapshot): ChatMessage[] => (
  transcript.records.map((record) => {
    if (record.kind === 'user') {
      return {
        role: 'user',
        content: partsToUnifiedContent(record.content),
        segments: []
      }
    }

    if (record.kind === 'assistant_step') {
      return {
        role: 'assistant',
        content: record.step.content,
        toolCalls: record.step.toolCalls.length > 0 ? [...record.step.toolCalls] : undefined,
        segments: []
      }
    }

    return {
      role: 'tool',
      name: record.toolName,
      toolCallId: record.toolCallId,
      content: typeof record.content === 'string'
        ? record.content
        : (() => {
            try {
              return JSON.stringify(record.content)
            } catch {
              return String(record.content)
            }
          })(),
      segments: []
    }
  })
)

export interface AgentRunCompletionAdapterInput {
  result: AgentLoopResult
  artifacts: StepArtifact[]
}

export interface AgentRunCompletionAdapter {
  adapt(input: AgentRunCompletionAdapterInput): AgentRunKernelResult
}

export class DefaultAgentRunCompletionAdapter implements AgentRunCompletionAdapter {
  adapt(input: AgentRunCompletionAdapterInput): AgentRunKernelResult {
    if (input.result.status === 'completed') {
      const stepResult: StepResult = {
        usage: input.result.usage ?? input.result.finalStep.usage,
        completed: true,
        finishReason: input.result.finalStep.finishReason,
        requestHistoryMessages: transcriptToMessages(input.result.transcript),
        artifacts: input.artifacts
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

    const error = new Error(input.result.failure.message)
    error.name = input.result.failure.name || 'Error'
    if (input.result.failure.code) {
      ;(error as Error & { code?: string }).code = input.result.failure.code
    }

    return {
      state: 'failed',
      error: serializeError(error)
    }
  }
}

import type { StepArtifact, StepResult } from '@main/agent/contracts'
import type { AgentLoopResult } from '@main/agent/runtime/loop/AgentLoopResult'
import { partsToUnifiedContent } from '@main/agent/runtime/model/ExecutableRequestAdapter'
import type { AgentTranscriptSnapshot } from '@main/agent/runtime/transcript/AgentTranscript'
import type { MainAgentRuntimeTerminalResult } from './MainAgentRuntimeResult'

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
  adapt(input: AgentRunCompletionAdapterInput): MainAgentRuntimeTerminalResult
}

export class DefaultAgentRunCompletionAdapter implements AgentRunCompletionAdapter {
  adapt(input: AgentRunCompletionAdapterInput): MainAgentRuntimeTerminalResult {
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

    return {
      state: 'failed',
      error: {
        name: input.result.failure.name || 'Error',
        message: input.result.failure.message,
        code: input.result.failure.code
      }
    }
  }
}

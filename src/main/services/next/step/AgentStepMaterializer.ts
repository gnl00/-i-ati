/**
 * AgentStepMaterializer
 *
 * 放置内容：
 * - 把 `AgentStepDraft` 物化成稳定的 `AgentStep`
 *
 * 业务逻辑边界：
 * - 它只负责 stable step 的收口
 * - 它不负责 draft delta 的累积
 * - 它不负责 step event 发射或 transcript write-back
 */
import type { AgentStep, AgentStepFailureInfo } from './AgentStep'
import type { AgentStepDraft } from './AgentStepDraft'

export type MaterializableCompletedStepDraft = AgentStepDraft & {
  status: 'completed'
}

export type MaterializableFailedStepDraft = AgentStepDraft & {
  status: 'failed'
}

export type MaterializableAbortedStepDraft = AgentStepDraft & {
  status: 'aborted'
}

export interface CompletedAgentStepMaterializerInput {
  draft: MaterializableCompletedStepDraft
  completedAt: number
  raw?: unknown
  failure?: never
  abortReason?: never
}

export interface FailedAgentStepMaterializerInput {
  draft: MaterializableFailedStepDraft
  completedAt: number
  raw?: unknown
  failure: AgentStepFailureInfo
  abortReason?: never
}

export interface AbortedAgentStepMaterializerInput {
  draft: MaterializableAbortedStepDraft
  completedAt: number
  raw?: unknown
  failure?: never
  abortReason: string
}

export type AgentStepMaterializerInput =
  | CompletedAgentStepMaterializerInput
  | FailedAgentStepMaterializerInput
  | AbortedAgentStepMaterializerInput

export interface AgentStepMaterializer {
  materialize(input: AgentStepMaterializerInput): AgentStep
}

export class DefaultAgentStepMaterializer implements AgentStepMaterializer {
  materialize(input: AgentStepMaterializerInput): AgentStep {
    const base = {
      stepId: input.draft.stepId,
      stepIndex: input.draft.stepIndex,
      startedAt: input.draft.startedAt,
      completedAt: input.completedAt,
      model: input.draft.snapshot.model,
      responseId: input.draft.snapshot.responseId,
      content: input.draft.snapshot.content,
      reasoning: input.draft.snapshot.reasoning,
      toolCalls: [...input.draft.snapshot.toolCalls],
      finishReason: input.draft.snapshot.finishReason,
      usage: input.draft.snapshot.usage,
      raw: input.raw
    }

    if (input.draft.status === 'failed') {
      const failureInput = input as FailedAgentStepMaterializerInput
      return {
        ...base,
        status: 'failed',
        failure: failureInput.failure
      }
    }

    if (input.draft.status === 'aborted') {
      const abortedInput = input as AbortedAgentStepMaterializerInput
      return {
        ...base,
        status: 'aborted',
        abortReason: abortedInput.abortReason
      }
    }

    return {
      ...base,
      status: 'completed'
    }
  }
}

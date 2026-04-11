/**
 * StepEvent
 *
 * 放置内容：
 * - 单个 AgentStep 相关的事件定义
 *
 * 预期事件类别：
 * - step.started
 * - step.delta
 * - step.completed
 * - step.failed
 * - step.aborted
 *
 * 业务逻辑边界：
 * - in-flight 事件应依赖 AgentStepDraft 或等价过程事实
 * - stable 事件应依赖 materialize 完成后的 AgentStep
 * - 不退化成 host-visible output payload
 */
import type { CompletedAgentStep, FailedAgentStep, AbortedAgentStep } from '../step/AgentStep'
import type { AgentStepDraftDelta, AgentStepDraftSnapshot } from '../step/AgentStepDraft'

export interface StepStartedEvent {
  type: 'step.started'
  stepId: string
  stepIndex: number
  timestamp: number
}

export interface StepDeltaEvent {
  type: 'step.delta'
  stepId: string
  stepIndex: number
  timestamp: number
  delta: AgentStepDraftDelta
  snapshot: AgentStepDraftSnapshot
}

export interface StepCompletedEvent {
  type: 'step.completed'
  timestamp: number
  step: CompletedAgentStep
}

export interface StepFailedEvent {
  type: 'step.failed'
  timestamp: number
  step: FailedAgentStep
}

export interface StepAbortedEvent {
  type: 'step.aborted'
  timestamp: number
  step: AbortedAgentStep
}

export type StepEvent =
  | StepStartedEvent
  | StepDeltaEvent
  | StepCompletedEvent
  | StepFailedEvent
  | StepAbortedEvent

/**
 * ToolEvent
 *
 * 放置内容：
 * - tool 执行阶段相关的事件定义
 *
 * 预期事件类别：
 * - tool.awaiting_confirmation
 * - tool.confirmation_denied
 * - tool.execution_progress
 *
 * 业务逻辑边界：
 * - 只表达工具执行过程中的 runtime 事实
 * - awaiting / denied 事件用于描述 approval flow 中的中间状态
 * - 不等价于 transcript 中的 tool_result record
 * - 不直接描述 host-visible message
 */
import type {
  ToolDeniedFact,
  ToolSuccessFact,
  ToolFailureFact,
  ToolAbortedFact
} from '../tools/ToolResultFact'

export interface ToolAwaitingConfirmationEvent {
  type: 'tool.awaiting_confirmation'
  timestamp: number
  stepId: string
  toolCallId: string
  toolCallIndex: number
  toolName: string
}

export interface ToolConfirmationDeniedEvent {
  type: 'tool.confirmation_denied'
  timestamp: number
  deniedResult: ToolDeniedFact
}

export interface ToolExecutionStartedEvent {
  type: 'tool.execution_progress'
  timestamp: number
  stepId: string
  toolCallId: string
  toolCallIndex: number
  toolName: string
  phase: 'started'
  result?: never
}

export interface ToolExecutionCompletedEvent {
  type: 'tool.execution_progress'
  timestamp: number
  phase: 'completed'
  result: ToolSuccessFact
}

export interface ToolExecutionFailedEvent {
  type: 'tool.execution_progress'
  timestamp: number
  phase: 'failed'
  result: ToolFailureFact
}

export interface ToolExecutionAbortedEvent {
  type: 'tool.execution_progress'
  timestamp: number
  phase: 'aborted'
  result: ToolAbortedFact
}

export type ToolEvent =
  | ToolAwaitingConfirmationEvent
  | ToolConfirmationDeniedEvent
  | ToolExecutionStartedEvent
  | ToolExecutionCompletedEvent
  | ToolExecutionFailedEvent
  | ToolExecutionAbortedEvent

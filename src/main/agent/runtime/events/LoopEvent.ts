/**
 * LoopEvent
 *
 * 放置内容：
 * - 整个 AgentLoop 级别的事件定义
 *
 * 预期事件类别：
 * - loop.completed
 * - loop.failed
 * - loop.aborted
 *
 * 业务逻辑边界：
 * - payload 应依赖整轮 run 的终态事实
 * - 不混入 step draft 或 host-facing message 语义
 */
import type {
  CompletedAgentLoopResult,
  FailedAgentLoopResult,
  AbortedAgentLoopResult
} from '../loop/AgentLoopResult'

export type LoopDraftDisposition = 'discarded' | 'materialized_partial'

export interface LoopCompletedEvent {
  type: 'loop.completed'
  timestamp: number
  result: CompletedAgentLoopResult
}

export interface LoopFailedEvent {
  type: 'loop.failed'
  timestamp: number
  result: FailedAgentLoopResult
}

export interface LoopAbortedEvent {
  type: 'loop.aborted'
  timestamp: number
  result: AbortedAgentLoopResult
  activeStepId?: string
  draftDisposition?: LoopDraftDisposition
}

export type LoopEvent =
  | LoopCompletedEvent
  | LoopFailedEvent
  | LoopAbortedEvent

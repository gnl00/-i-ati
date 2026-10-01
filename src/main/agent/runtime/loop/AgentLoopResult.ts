/**
 * AgentLoopResult
 *
 * 放置内容：
 * - 整个 loop 的最终输出
 * - 包含最终 step、完整 `ContextSnapshot`、usage 汇总、终态
 *
 * 业务逻辑边界：
 * - 它服务于 run-level orchestration
 * - 它回答的是“这一轮 loop 最后怎样了”
 * - 它不是 chat transcript，也不是 renderer payload
 * - 它不负责描述 host-visible output
 */
import type { AgentStep } from '../step/AgentStep'
import type { ContextSnapshot } from '../context/ContextSnapshot'

export interface AgentLoopFailureInfo {
  name?: string
  message: string
  code?: string
  cause?: AgentLoopFailureInfo
}

export interface AgentLoopResultBase {
  startedAt: number
  completedAt: number
  transcript: ContextSnapshot
  usage?: ITokenUsage
}

export interface CompletedAgentLoopResult extends AgentLoopResultBase {
  status: 'completed'
  finalStep: AgentStep
  failure?: never
  abortReason?: never
}

export interface FailedAgentLoopResult extends AgentLoopResultBase {
  status: 'failed'
  failure: AgentLoopFailureInfo
  finalStep?: AgentStep
  abortReason?: never
}

export interface AbortedAgentLoopResult extends AgentLoopResultBase {
  status: 'aborted'
  abortReason: string
  finalStep?: AgentStep
  failure?: never
}

export type AgentLoopResult =
  CompletedAgentLoopResult | FailedAgentLoopResult | AbortedAgentLoopResult

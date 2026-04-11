/**
 * ToolDispatchOutcome
 *
 * 放置内容：
 * - 单个 ToolBatch 交给 dispatcher 执行后的稳定结果 contract
 *
 * 业务逻辑边界：
 * - `completed` 表示 dispatcher 已稳定产出可写回的 `ToolResultFact[]`
 * - `failed` / `aborted` 表示 dispatcher 这一段本身进入 terminal path
 * - loop 应基于这个结果决定：
 *   - 是否把结果写回 transcript
 *   - 是否继续下一轮模型请求
 *   - 是否进入 loop terminal
 */
import type { ToolResultFact } from './ToolResultFact'

export interface ToolDispatchFailure {
  name?: string
  message: string
  code?: string
}

export interface CompletedToolDispatchOutcome {
  status: 'completed'
  batchId: string
  stepId: string
  results: ToolResultFact[]
}

export interface FailedToolDispatchOutcome {
  status: 'failed'
  batchId: string
  stepId: string
  failure: ToolDispatchFailure
  partialResults?: ToolResultFact[]
}

export interface AbortedToolDispatchOutcome {
  status: 'aborted'
  batchId: string
  stepId: string
  abortReason: string
  partialResults?: ToolResultFact[]
}

export type ToolDispatchOutcome =
  | CompletedToolDispatchOutcome
  | FailedToolDispatchOutcome
  | AbortedToolDispatchOutcome

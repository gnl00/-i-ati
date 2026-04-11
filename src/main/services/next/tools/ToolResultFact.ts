/**
 * ToolResultFact
 *
 * 放置内容：
 * - tool 执行完成后得到的 runtime-native 结果事实
 *
 * 业务逻辑边界：
 * - 它是 event 和 transcript 都可以消费的中间事实
 * - 它本身不是 transcript record
 * - loop 可以基于它 materialize 出稳定的 `tool_result` record
 */
export interface ToolResultError {
  name?: string
  message: string
  code?: string
}

export interface ToolResultFactBase {
  stepId: string
  toolCallId: string
  toolCallIndex: number
  toolName: string
  cost?: number
}

export interface ToolSuccessFact extends ToolResultFactBase {
  status: 'success'
  content?: unknown
  error?: never
}

export interface ToolFailureFact extends ToolResultFactBase {
  status: 'error' | 'timeout'
  content?: unknown
  error?: ToolResultError
}

export interface ToolAbortedFact extends ToolResultFactBase {
  status: 'aborted'
  content?: unknown
  error?: ToolResultError
}

export interface ToolDeniedFact extends ToolResultFactBase {
  status: 'denied'
  content?: unknown
  error?: ToolResultError
}

export type ToolResultFact =
  | ToolSuccessFact
  | ToolFailureFact
  | ToolAbortedFact
  | ToolDeniedFact

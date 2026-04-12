/**
 * AgentStep
 *
 * 放置内容：
 * - next 架构中单次模型请求的稳定结果结构
 * - 表达一个 step 内最终得到的 text / reasoning / toolCalls / usage / finish reason
 *
 * 业务逻辑边界：
 * - 它是 runtime-native step，不是用户可见消息
 * - 它回答的是“这一次模型请求实际发生了什么”
 * - 它应当作为 assistant transcript record 的 payload
 * - 它也是 step output 的输入来源
 *
 * 约束：
 * - 不复用 MessageEntity
 * - 不携带 chat-specific UI 状态
 * - 不承担 host-facing visibility 决策
 */
export type AgentStepStatus = 'completed' | 'failed' | 'aborted'

export interface AgentStepFailureInfo {
  name?: string
  message: string
  code?: string
}

export interface AgentStepBase {
  stepId: string
  stepIndex: number
  startedAt: number
  completedAt: number
  model?: string
  responseId?: string
  content: string
  reasoning?: string
  toolCalls: IToolCall[]
  finishReason?: IUnifiedResponse['finishReason']
  usage?: ITokenUsage
  raw?: unknown
}

export interface CompletedAgentStep extends AgentStepBase {
  status: 'completed'
  failure?: never
  abortReason?: never
}

export interface FailedAgentStep extends AgentStepBase {
  status: 'failed'
  failure: AgentStepFailureInfo
  abortReason?: never
}

export interface AbortedAgentStep extends AgentStepBase {
  status: 'aborted'
  abortReason: string
  failure?: never
}

export type AgentStep =
  | CompletedAgentStep
  | FailedAgentStep
  | AbortedAgentStep

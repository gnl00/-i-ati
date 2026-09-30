/**
 * AgentStepDraft
 *
 * 放置内容：
 * - 单次 step 的流式工作区
 * - 按 append-only 的方式积累 deltas、toolCalls、usage、status
 * - 在 step 结束时 materialize 成 AgentStep
 *
 * 业务逻辑边界：
 * - 它是 loop 内部状态，不直接暴露给 host
 * - 它不是 message，也不是 output result
 *
 * 约束：
 * - source of truth 应是 runtime deltas / facts
 * - 允许维护 snapshot cache，但 snapshot 只是派生视图
 * - `streaming` 是唯一在途状态
 * - `completed | failed | aborted` 是稳定终态，可以直接进入 `AgentStepMaterializer`
 * - 检测到可执行 tool calls 不改变 draft 状态；收口时才一次性推进到 `completed`
 */
export type AgentStepDraftStatus =
  | 'streaming'
  | 'completed'
  | 'failed'
  | 'aborted'

export interface AgentStepDraftDeltaBase {
  timestamp: number
}

export interface AgentStepContentDelta extends AgentStepDraftDeltaBase {
  type: 'content_delta'
  content: string
}

export interface AgentStepReasoningDelta extends AgentStepDraftDeltaBase {
  type: 'reasoning_delta'
  reasoning: string
}

export interface AgentStepToolCallStartedDelta extends AgentStepDraftDeltaBase {
  type: 'tool_call_started'
  toolCallId: string
  toolCallIndex?: number
  toolName: string
}

/**
 * tool_call_ready
 *
 * 顺序约束：
 * - loop / executor 应把它视为唯一的“现在可以开始执行工具”的稳定节点
 * - 如果同一条 call 之前已经发过 `tool_call_started`，这里表示它从可预渲染进入可执行
 * - 如果名字和完整参数在同一个 chunk 才同时拿到，允许直接发出 `tool_call_ready`
 *   而不强制要求先单独发一条 `tool_call_started`
 * - 因此：`tool_call_ready` 不要求前面必须已有 `tool_call_started`
 * - 但如果两者同 chunk 同时发出，消费方应按 started -> ready 的顺序理解
 */
export interface AgentStepToolCallReadyDelta extends AgentStepDraftDeltaBase {
  type: 'tool_call_ready'
  toolCall: IToolCall
}

export interface AgentStepFinishReasonDelta extends AgentStepDraftDeltaBase {
  type: 'finish_reason'
  finishReason: IUnifiedResponse['finishReason']
}

export interface AgentStepUsageDelta extends AgentStepDraftDeltaBase {
  type: 'usage_delta'
  usage: ITokenUsage
}

export interface AgentStepResponseMetadataDelta extends AgentStepDraftDeltaBase {
  type: 'response_metadata'
  responseId?: string
  model?: string
}

export type AgentStepDraftDelta =
  | AgentStepContentDelta
  | AgentStepReasoningDelta
  | AgentStepToolCallStartedDelta
  | AgentStepToolCallReadyDelta
  | AgentStepFinishReasonDelta
  | AgentStepUsageDelta
  | AgentStepResponseMetadataDelta

export interface AgentStepDraftSnapshot {
  content: string
  reasoning?: string
  toolCalls: IToolCall[]
  finishReason?: IUnifiedResponse['finishReason']
  usage?: ITokenUsage
  model?: string
  responseId?: string
}

export interface AgentStepDraft {
  stepId: string
  stepIndex: number
  status: AgentStepDraftStatus
  startedAt: number
  updatedAt: number
  deltas: AgentStepDraftDelta[]
  snapshot: AgentStepDraftSnapshot
}

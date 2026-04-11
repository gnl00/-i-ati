/**
 * ReadyToolCall
 *
 * 放置内容：
 * - 已经完整成形、可以进入 ToolBatch 组装的 tool call contract
 *
 * 业务逻辑边界：
 * - 它由 `ToolCallReadyFact` materialize 而来
 * - 它是单个 step 内的 batch 组装输入，不是流式 parser state
 * - 它不承载执行状态，执行状态属于 `ToolBatchCall`
 */
export interface ReadyToolCall {
  toolCallId: string
  index: number
  name: string
  arguments: string
}

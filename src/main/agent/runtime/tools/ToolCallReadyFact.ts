/**
 * ToolCallReadyFact
 *
 * 放置内容：
 * - 从 step facts 中提炼出来的、可供 tools 层消费的 ready tool call 事实
 *
 * 业务逻辑边界：
 * - 它表达“某条 tool call 已完整成形，可以进入 tools 桥接”
 * - 它不等于 step delta 本身，也不承载 batch / execution 状态
 * - tools 层应依赖这个事实，而不是直接依赖 `step/` 下的 delta 命名
 */
export interface ToolCallReadyFact {
  toolCall: IToolCall
}

/**
 * LoopRunDescriptor
 *
 * 放置内容：
 * - 单次 loop / run 的稳定标识信息
 *
 * 业务逻辑边界：
 * - 它描述“这是哪一次 run”
 * - 它不承载 transcript / request / execution config
 * - 它不承载运行中的 mutable state
 */
export interface LoopRunDescriptor {
  runId: string
}

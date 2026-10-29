/**
 * LoopExecutionConfig
 *
 * 放置内容：
 * - loop 运行期间共享的稳定执行配置
 *
 * 业务逻辑边界：
 * - 它描述“这轮 loop 运行时有哪些稳定约束”
 * - 它不承载启动事实
 * - 它不承载运行中的 mutable state
 * - 它不负责表达外部取消通道，取消仍应通过 `AbortSignal`
 */
export interface LoopExecutionConfig {
  /** Maximum model response attempts per run, including empty-response recovery; defaults to 80. Transport retries before a stream is returned remain bounded separately. */
  maxSteps?: number
}

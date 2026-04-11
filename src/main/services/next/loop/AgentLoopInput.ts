/**
 * AgentLoopInput
 *
 * 放置内容：
 * - 启动一次 AgentLoop 所需的最小输入 contract
 *
 * 预期内容：
 * - run 标识
 * - 初始 AgentTranscript（包含启动所需的首条 user record）
 * - AgentRequestSpec
 * - loop 运行需要的稳定配置
 * - 外部取消通道
 *
 * 业务逻辑边界：
 * - 它描述“跑这一次 loop 需要什么”
 * - 它不承载运行中的 mutable state
 * - 它不直接携带 host-facing output payload
 * - 它不应该退化成额外的 mutable request bag
 * - 启动事实应通过 transcript 提供，不再保留 transcript 外的第二入口
 */
import type { AgentRequestSpec } from '../request/AgentRequestSpec'
import type { AgentTranscript } from '../transcript/AgentTranscript'
import type { LoopExecutionConfig } from './LoopExecutionConfig'
import type { LoopRunDescriptor } from './LoopRunDescriptor'

export interface AgentLoopInput {
  run: LoopRunDescriptor
  transcript: AgentTranscript
  requestSpec: AgentRequestSpec
  execution?: LoopExecutionConfig
  signal?: AbortSignal
}

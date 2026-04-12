/**
 * AgentRuntimeRunInput
 *
 * 放置内容：
 * - 一次 runtime run 入口的稳定输入 contract
 *
 * 业务逻辑边界：
 * - 它停留在 host run request + execution config + signal 这一层
 * - 它不是 `AgentLoop` 的直接入参
 * - 它用于驱动 runtime 内部的 per-run source resolve
 */
import type { HostRunRequest } from './host/bootstrap/HostRunRequest'
import type { LoopExecutionConfig } from './loop/LoopExecutionConfig'

export interface AgentRuntimeRunInput {
  hostRequest: HostRunRequest
  execution?: LoopExecutionConfig
  signal?: AbortSignal
}

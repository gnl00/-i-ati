/**
 * HostRunRequest
 *
 * 放置内容：
 * - 外部宿主触发一次 run 时的原始输入 contract
 *
 * 业务逻辑边界：
 * - 它仍然属于 host 语义，不是 core runtime state
 * - 它是 bootstrap 的输入，不是 AgentLoop 的直接入参
 */
import type { AgentContentPart } from '../../transcript/AgentContentPart'

export interface HostRunRequest {
  hostType: string
  hostRequestId: string
  submittedAt: number
  userContent: AgentContentPart[]
  metadata?: Record<string, unknown>
}

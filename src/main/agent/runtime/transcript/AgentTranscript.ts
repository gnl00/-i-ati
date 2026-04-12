/**
 * AgentTranscript
 *
 * 放置内容：
 * - agent runtime 的内部协议历史容器
 * - 它持有按顺序排列的 `AgentTranscriptRecord`
 *
 * 业务逻辑边界：
 * - 它只为模型续上下文服务
 * - 它回答的是“当前 loop 累积了哪些协议事实”
 * - 它不是 chat transcript，不应复用 MessageEntity
 * - 它不直接负责把自己转成 provider request payload
 */
import type { AgentTranscriptRecord } from './AgentTranscriptRecord'

export interface AgentTranscript {
  transcriptId: string
  createdAt: number
  updatedAt: number
  records: AgentTranscriptRecord[]
}

/**
 * 终态 transcript 快照。
 *
 * 注意：
 * - 这里表达的是快照语义，以及 `records` 数组本身只读
 * - 它当前不是深不可变结构
 */
export interface AgentTranscriptSnapshot {
  transcriptId: string
  createdAt: number
  updatedAt: number
  records: readonly AgentTranscriptRecord[]
}

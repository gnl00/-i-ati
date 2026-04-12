/**
 * UserRecordMaterializer
 *
 * 放置内容：
 * - 把首条用户输入物化成稳定的 `user` transcript record
 *
 * 业务逻辑边界：
 * - 它只负责 `user` record 的生成
 * - 它不负责初始 transcript 容器的生成
 * - 它不负责 host request 解析或 loop bootstrap orchestration
 */
import type { AgentContentPart } from './AgentContentPart'
import type { AgentTranscriptUserRecord } from './AgentTranscriptRecord'

export interface UserRecordMaterializerInput {
  recordId: string
  timestamp: number
  content: AgentContentPart[]
}

export interface UserRecordMaterializer {
  materialize(input: UserRecordMaterializerInput): AgentTranscriptUserRecord
}

export class DefaultUserRecordMaterializer implements UserRecordMaterializer {
  materialize(input: UserRecordMaterializerInput): AgentTranscriptUserRecord {
    return {
      recordId: input.recordId,
      kind: 'user',
      timestamp: input.timestamp,
      content: [...input.content]
    }
  }
}

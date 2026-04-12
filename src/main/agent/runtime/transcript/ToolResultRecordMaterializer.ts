/**
 * ToolResultRecordMaterializer
 *
 * 放置内容：
 * - 把 `ToolResultFact` 物化成可写入 transcript 的稳定 `tool_result` record
 *
 * 业务逻辑边界：
 * - 它只负责 write-back record 的生成
 * - 它不决定 loop 是否继续下一轮，也不决定 terminal path
 * - denied / aborted tool result 也应通过同一条 write-back 链路进入 transcript
 */
import type { ToolResultFact } from '../tools/ToolResultFact'
import type { AgentTranscriptToolResultRecord } from './AgentTranscriptRecord'

export interface ToolResultRecordMaterializerInput {
  recordId: string
  timestamp: number
  result: ToolResultFact
}

export interface ToolResultRecordMaterializer {
  materialize(input: ToolResultRecordMaterializerInput): AgentTranscriptToolResultRecord
}

export class DefaultToolResultRecordMaterializer
implements ToolResultRecordMaterializer {
  materialize(input: ToolResultRecordMaterializerInput): AgentTranscriptToolResultRecord {
    return {
      ...input.result,
      recordId: input.recordId,
      kind: 'tool_result',
      timestamp: input.timestamp
    }
  }
}

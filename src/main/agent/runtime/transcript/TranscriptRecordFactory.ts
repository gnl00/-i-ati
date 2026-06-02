/**
 * TranscriptRecordFactory
 *
 * 放置内容：
 * - 把 runtime facts 物化成可写入 transcript 的稳定 records
 *
 * 业务逻辑边界：
 * - 它只负责 transcript write-back record 的生成
 * - step visibility、loop continuation、terminal path 由 loop / host 层决策
 * - denied / aborted tool result 也应通过同一条 write-back 链路进入 transcript
 */
import type { AgentStep } from '../step/AgentStep'
import type { ToolResultFact } from '../tools/ToolResultFact'
import type {
  AgentTranscriptAssistantStepRecord,
  AgentTranscriptToolResultRecord
} from './AgentTranscriptRecord'

export interface CreateAssistantStepRecordInput {
  recordId: string
  timestamp: number
  step: AgentStep
}

export interface CreateToolResultRecordInput {
  recordId: string
  timestamp: number
  result: ToolResultFact
}

export interface TranscriptRecordFactory {
  createAssistantStep(
    input: CreateAssistantStepRecordInput
  ): AgentTranscriptAssistantStepRecord
  createToolResult(input: CreateToolResultRecordInput): AgentTranscriptToolResultRecord
}

export class DefaultTranscriptRecordFactory
implements TranscriptRecordFactory {
  createAssistantStep(
    input: CreateAssistantStepRecordInput
  ): AgentTranscriptAssistantStepRecord {
    return {
      recordId: input.recordId,
      kind: 'assistant_step',
      timestamp: input.timestamp,
      step: input.step
    }
  }

  createToolResult(input: CreateToolResultRecordInput): AgentTranscriptToolResultRecord {
    return {
      ...input.result,
      recordId: input.recordId,
      kind: 'tool_result',
      timestamp: input.timestamp,
      replayMode: 'hot'
    }
  }
}

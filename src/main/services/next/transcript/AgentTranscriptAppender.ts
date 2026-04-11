/**
 * AgentTranscriptAppender
 *
 * 放置内容：
 * - 把稳定 records 追加进 live `AgentTranscript`
 *
 * 业务逻辑边界：
 * - 它只负责 transcript mutation
 * - 它不负责生成 records
 * - 它负责把 `updatedAt` 一并推进
 */
import type { AgentTranscript } from './AgentTranscript'
import type { AgentTranscriptRecord } from './AgentTranscriptRecord'

export interface AgentTranscriptAppenderInput {
  transcript: AgentTranscript
  records: AgentTranscriptRecord[]
  updatedAt: number
}

export interface AgentTranscriptAppender {
  append(input: AgentTranscriptAppenderInput): AgentTranscript
}

export class DefaultAgentTranscriptAppender implements AgentTranscriptAppender {
  append(input: AgentTranscriptAppenderInput): AgentTranscript {
    return {
      ...input.transcript,
      updatedAt: input.updatedAt,
      records: [...input.transcript.records, ...input.records]
    }
  }
}

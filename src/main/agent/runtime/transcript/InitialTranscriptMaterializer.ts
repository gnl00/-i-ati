/**
 * InitialTranscriptMaterializer
 *
 * 放置内容：
 * - 把首批稳定 records 物化成初始 live `AgentTranscript`
 *
 * 业务逻辑边界：
 * - 它只负责初始 transcript 容器的生成
 * - 它不负责 record 本身的生成
 * - 它不负责后续 live transcript append
 */
import type { AgentTranscript } from './AgentTranscript'
import type { AgentTranscriptRecord } from './AgentTranscriptRecord'

export interface InitialTranscriptMaterializerInput {
  transcriptId: string
  createdAt: number
  updatedAt: number
  records: AgentTranscriptRecord[]
}

export interface InitialTranscriptMaterializer {
  materialize(input: InitialTranscriptMaterializerInput): AgentTranscript
}

export class DefaultInitialTranscriptMaterializer implements InitialTranscriptMaterializer {
  materialize(input: InitialTranscriptMaterializerInput): AgentTranscript {
    return {
      transcriptId: input.transcriptId,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
      records: [...input.records]
    }
  }
}

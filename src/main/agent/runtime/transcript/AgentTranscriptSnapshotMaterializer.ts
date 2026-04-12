/**
 * AgentTranscriptSnapshotMaterializer
 *
 * 放置内容：
 * - 把 live `AgentTranscript` 收口成终态 `AgentTranscriptSnapshot`
 *
 * 业务逻辑边界：
 * - 它只负责终态快照物化
 * - 它不负责 live transcript mutation
 * - 它不负责 request materialization
 */
import type { AgentTranscript, AgentTranscriptSnapshot } from './AgentTranscript'

export interface AgentTranscriptSnapshotMaterializer {
  materialize(transcript: AgentTranscript): AgentTranscriptSnapshot
}

export class DefaultAgentTranscriptSnapshotMaterializer implements AgentTranscriptSnapshotMaterializer {
  materialize(transcript: AgentTranscript): AgentTranscriptSnapshot {
    return {
      transcriptId: transcript.transcriptId,
      createdAt: transcript.createdAt,
      updatedAt: transcript.updatedAt,
      records: [...transcript.records]
    }
  }
}

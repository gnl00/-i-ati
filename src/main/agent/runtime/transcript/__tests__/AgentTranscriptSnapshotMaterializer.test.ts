import { describe, expect, it } from 'vitest'
import type { AgentTranscript } from '../AgentTranscript'
import { DefaultAgentTranscriptSnapshotMaterializer } from '../AgentTranscriptSnapshotMaterializer'

describe('DefaultAgentTranscriptSnapshotMaterializer', () => {
  it('copies the record list without changing output or performing terminal normalization', () => {
    const transcript: AgentTranscript = {
      transcriptId: 't',
      createdAt: 1,
      updatedAt: 2,
      records: [
        {
          recordId: 'r',
          kind: 'tool_result',
          timestamp: 2,
          stepId: 's',
          toolCallId: 'c',
          toolCallIndex: 0,
          toolName: 'exec',
          status: 'success',
          content: 'x'.repeat(40_000),
          modelContent: 'stable preview'
        }
      ]
    }
    const snapshot = new DefaultAgentTranscriptSnapshotMaterializer().materialize(transcript)
    expect(snapshot).toEqual(transcript)
    expect(snapshot.records).not.toBe(transcript.records)
    expect(snapshot.records[0]).toBe(transcript.records[0])
  })
})

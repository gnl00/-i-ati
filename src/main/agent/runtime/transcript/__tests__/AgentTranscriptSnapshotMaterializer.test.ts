import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DefaultToolResultNormalizer, isNormalizedToolResultContent } from '../../tools/result-normalization'
import type { AgentTranscript } from '../AgentTranscript'
import { DefaultAgentTranscriptSnapshotMaterializer } from '../AgentTranscriptSnapshotMaterializer'

let tempDir = ''

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true })
    tempDir = ''
  }
})

const createMaterializer = (): DefaultAgentTranscriptSnapshotMaterializer => {
  tempDir = mkdtempSync(path.join(tmpdir(), 'transcript-snapshot-'))
  return new DefaultAgentTranscriptSnapshotMaterializer({
    toolResultNormalizer: new DefaultToolResultNormalizer({
      baseDir: tempDir,
      scopeId: 'chat-1',
      maxInlineCharacters: 20
    })
  })
}

describe('DefaultAgentTranscriptSnapshotMaterializer', () => {
  it('cools hot tool results into normalized content for terminal snapshots', () => {
    const materializer = createMaterializer()
    const transcript: AgentTranscript = {
      transcriptId: 'transcript-1',
      createdAt: 1,
      updatedAt: 2,
      records: [
        {
          recordId: 'tool-1',
          kind: 'tool_result',
          timestamp: 2,
          stepId: 'step-1',
          toolCallId: 'call-1',
          toolCallIndex: 0,
          toolName: 'computer_use_state',
          status: 'success',
          replayMode: 'hot',
          content: 'x'.repeat(100)
        }
      ]
    }

    const snapshot = materializer.materialize(transcript)
    const record = snapshot.records[0]

    expect(record.kind).toBe('tool_result')
    if (record.kind !== 'tool_result') {
      throw new Error('Expected tool_result record')
    }

    expect(record.replayMode).toBe('cold')
    expect(isNormalizedToolResultContent(record.content)).toBe(true)
    if (!isNormalizedToolResultContent(record.content)) {
      throw new Error('Expected normalized content')
    }
    expect(record.content.original.triggers).toContain('large_content')
    expect(record.content.artifacts.some(artifact => artifact.kind === 'raw_result')).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import type { ToolResultFact } from '@main/agent/runtime/tools/ToolResultFact'
import {
  ResolvedToolResultTranscriptRecordFactory,
  ToolResultResolutionStore
} from '../ToolResultResolutionStore'

describe('ToolResultResolutionStore', () => {
  it('replaces transcript content while preserving the shared runtime fact', () => {
    const result: ToolResultFact = {
      status: 'success',
      stepId: 'step-1',
      toolCallId: 'call-1',
      toolCallIndex: 0,
      toolName: 'web_fetch',
      content: {
        raw: true
      }
    }
    const resolutions = new ToolResultResolutionStore()
    const factory = new ResolvedToolResultTranscriptRecordFactory(resolutions)

    resolutions.set(result, 'compact result')
    const record = factory.createToolResult({
      recordId: 'record-1',
      timestamp: 10,
      result
    })

    expect(record.content).toBe('compact result')
    expect(result.content).toEqual({
      raw: true
    })
  })
})

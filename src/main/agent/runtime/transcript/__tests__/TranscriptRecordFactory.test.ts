import { describe, expect, it } from 'vitest'
import type { AgentStep } from '../../step/AgentStep'
import type { ToolResultFact } from '../../tools/ToolResultFact'
import { DefaultTranscriptRecordFactory } from '../TranscriptRecordFactory'

describe('DefaultTranscriptRecordFactory', () => {
  it('creates assistant_step transcript records from agent steps', () => {
    const factory = new DefaultTranscriptRecordFactory()
    const step: AgentStep = {
      stepId: 'step-1',
      stepIndex: 0,
      startedAt: 10,
      completedAt: 20,
      status: 'completed',
      content: 'assistant answer',
      reasoning: 'reasoning trace',
      toolCalls: [],
      finishReason: 'stop'
    }

    const record = factory.createAssistantStep({
      recordId: 'record-1',
      timestamp: 20,
      step
    })

    expect(record).toEqual({
      recordId: 'record-1',
      kind: 'assistant_step',
      timestamp: 20,
      step
    })
  })

  it('creates hot tool_result transcript records from tool result facts', () => {
    const factory = new DefaultTranscriptRecordFactory()
    const result: ToolResultFact = {
      stepId: 'step-1',
      toolCallId: 'tool-1',
      toolCallIndex: 0,
      toolName: 'sum',
      status: 'success',
      content: {
        result: 2
      },
      cost: 7
    }

    const record = factory.createToolResult({
      recordId: 'record-2',
      timestamp: 30,
      result
    })

    expect(record).toEqual({
      ...result,
      recordId: 'record-2',
      kind: 'tool_result',
      timestamp: 30,
      replayMode: 'hot'
    })
  })
})

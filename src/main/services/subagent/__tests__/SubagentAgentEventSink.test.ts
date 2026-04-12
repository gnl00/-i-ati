import { describe, expect, it } from 'vitest'
import { SubagentAgentEventSink } from '../runtime/SubagentAgentEventSink'

describe('SubagentAgentEventSink', () => {
  it('collects tools used and files touched from tool events', async () => {
    const sink = new SubagentAgentEventSink()

    await sink.handle({
      type: 'step.delta',
      stepId: 'step-1',
      stepIndex: 0,
      timestamp: 1,
      delta: {
        type: 'tool_call_started',
        timestamp: 1,
        toolCallId: 'tool-1',
        toolCallIndex: 0,
        toolName: 'write'
      },
      snapshot: {
        content: '',
        toolCalls: []
      }
    })

    await sink.handle({
      type: 'tool.execution_progress',
      timestamp: 2,
      phase: 'completed',
      result: {
        stepId: 'step-1',
        toolCallId: 'tool-1',
        toolCallIndex: 0,
        toolName: 'write',
        status: 'success',
        content: {
          file_path: '/tmp/example.ts'
        }
      }
    })

    expect(sink.buildArtifacts()).toEqual({
      tools_used: ['write'],
      files_touched: ['/tmp/example.ts']
    })
  })
})

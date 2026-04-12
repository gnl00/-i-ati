import { describe, expect, it } from 'vitest'
import { DefaultAgentRunCompletionAdapter } from '../AgentRunCompletionAdapter'

describe('AgentRunCompletionAdapter', () => {
  it('keeps file input semantics aligned with executable request adaptation', () => {
    const adapter = new DefaultAgentRunCompletionAdapter()

    const runtimeResult = adapter.adapt({
      result: {
        status: 'completed',
        startedAt: 1,
        completedAt: 2,
        transcript: {
          transcriptId: 'transcript-1',
          createdAt: 1,
          updatedAt: 2,
          records: [{
            recordId: 'record-1',
            kind: 'user',
            timestamp: 1,
            content: [{
              type: 'input_file',
              filename: 'spec.md',
              fileId: 'file-1'
            }]
          }]
        },
        finalStep: {
          status: 'completed',
          stepId: 'step-1',
          stepIndex: 0,
          startedAt: 1,
          completedAt: 2,
          content: 'done',
          toolCalls: [],
          finishReason: 'stop'
        }
      },
      artifacts: []
    })

    expect(runtimeResult.state).toBe('completed')
    if (runtimeResult.state !== 'completed') {
      throw new Error('Expected completed runtime result')
    }

    expect(runtimeResult.stepResult.requestHistoryMessages[0]).toMatchObject({
      role: 'user',
      content: [{
        type: 'text',
        text: '[file:spec.md]'
      }]
    })
  })
})

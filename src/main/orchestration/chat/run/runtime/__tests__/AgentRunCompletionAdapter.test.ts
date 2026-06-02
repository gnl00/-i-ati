import { describe, expect, it } from 'vitest'
import { DefaultAgentRunCompletionAdapter } from '../AgentRunCompletionAdapter'

describe('AgentRunCompletionAdapter', () => {
  it('adapts completed loop results into step results', () => {
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
          usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
          finishReason: 'stop'
        }
      }
    })

    expect(runtimeResult.state).toBe('completed')
    if (runtimeResult.state !== 'completed') {
      throw new Error('Expected completed runtime result')
    }

    expect(runtimeResult.stepResult).toEqual({
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 }
    })
  })

  it('returns loop failure details without creating a misleading adapter stack', () => {
    const adapter = new DefaultAgentRunCompletionAdapter()

    const runtimeResult = adapter.adapt({
      result: {
        status: 'failed',
        startedAt: 1,
        completedAt: 2,
        transcript: {
          transcriptId: 'transcript-1',
          createdAt: 1,
          updatedAt: 2,
          records: []
        },
        failure: {
          name: 'TypeError',
          message: 'terminated',
          code: 'UND_ERR_SOCKET'
        }
      }
    })

    expect(runtimeResult).toEqual({
      state: 'failed',
      error: {
        name: 'TypeError',
        message: 'terminated',
        code: 'UND_ERR_SOCKET'
      }
    })
  })
})

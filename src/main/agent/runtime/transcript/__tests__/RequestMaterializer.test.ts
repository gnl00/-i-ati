import { describe, expect, it } from 'vitest'
import { DefaultRequestMaterializer } from '../RequestMaterializer'
import type { AgentTranscript } from '../AgentTranscript'

describe('DefaultRequestMaterializer', () => {
  it('preserves assistant reasoning for protocol replay', () => {
    const materializer = new DefaultRequestMaterializer()
    const transcript: AgentTranscript = {
      transcriptId: 'transcript-1',
      createdAt: 1,
      updatedAt: 2,
      records: [
        {
          recordId: 'assistant-1',
          kind: 'assistant_step',
          timestamp: 2,
          step: {
            stepId: 'step-1',
            stepIndex: 0,
            startedAt: 1,
            completedAt: 2,
            status: 'completed',
            content: 'answer',
            reasoning: 'thinking trace',
            toolCalls: []
          }
        }
      ]
    }

    const request = materializer.materialize({
      transcript,
      requestSpec: {
        adapterPluginId: 'openai-chat-compatible-adapter',
        baseUrl: 'https://example.invalid/v1',
        apiKey: 'test-key',
        model: 'test-model'
      }
    })

    expect(request.messages).toEqual([
      {
        role: 'assistant',
        content: 'answer',
        reasoning: 'thinking trace',
        toolCalls: undefined
      }
    ])
  })
})

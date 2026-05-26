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

  it('compacts inline image tool results during protocol replay', () => {
    const materializer = new DefaultRequestMaterializer()
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
          toolName: 'vision_tool',
          status: 'success',
          content: `{"image":"data:image/png;base64,${'a'.repeat(200)}"}`
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

    expect(request.messages[0]).toMatchObject({
      role: 'tool',
      content: expect.stringContaining('[Tool result compacted for model request]'),
      toolCallId: 'call-1',
      toolName: 'vision_tool'
    })
    expect((request.messages[0] as { content: string }).content).not.toContain('data:image/png;base64')
  })

  it('preserves hot tool results during active run replay', () => {
    const materializer = new DefaultRequestMaterializer()
    const largeContent = JSON.stringify({
      nodes: 'x'.repeat(40_000),
      image: `data:image/png;base64,${'a'.repeat(200)}`
    })
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
          content: largeContent
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

    expect(request.messages[0]).toMatchObject({
      role: 'tool',
      content: largeContent,
      toolCallId: 'call-1',
      toolName: 'computer_use_state'
    })
  })
})

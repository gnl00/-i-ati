import { describe, expect, it } from 'vitest'
import { DefaultRequestMaterializer } from '../RequestMaterializer'
import type { AgentTranscript } from '../AgentTranscript'
import type { NormalizedToolResultContent } from '../../tools/result-normalization'
import { MESSAGE_SOURCE } from '@shared/messages/messageSources'

describe('DefaultRequestMaterializer', () => {
  it('merges hidden request context into the following user protocol message', () => {
    const materializer = new DefaultRequestMaterializer()
    const transcript: AgentTranscript = {
      transcriptId: 'transcript-1',
      createdAt: 1,
      updatedAt: 2,
      records: [
        {
          recordId: 'history-user',
          kind: 'user',
          timestamp: 1,
          content: [{ type: 'input_text', text: 'previous user' }]
        },
        {
          recordId: 'history-assistant',
          kind: 'assistant_step',
          timestamp: 1,
          step: {
            stepId: 'step-1',
            stepIndex: 0,
            startedAt: 1,
            completedAt: 1,
            status: 'completed',
            content: 'previous answer',
            toolCalls: []
          }
        },
        {
          recordId: 'env-context',
          kind: 'user',
          timestamp: 2,
          source: MESSAGE_SOURCE.SYSTEM_ENVIRONMENT_CONTEXT,
          content: [{ type: 'input_text', text: '<system-environment>{"currentDate":"2026-06-26"}</system-environment>' }]
        },
        {
          recordId: 'user-info-context',
          kind: 'user',
          timestamp: 2,
          source: MESSAGE_SOURCE.USER_INFO_CONTEXT,
          content: [{ type: 'input_text', text: '<user_info_context>{"profile":{"name":"Gn"}}</user_info_context>' }]
        },
        {
          recordId: 'awake-context',
          kind: 'user',
          timestamp: 2,
          source: MESSAGE_SOURCE.AWAKE_CONTEXT,
          content: [{ type: 'input_text', text: '<awake_state>{"chat_meta":{"chat_id":1}}</awake_state>' }]
        },
        {
          recordId: 'current-user',
          kind: 'user',
          timestamp: 2,
          content: [{ type: 'input_text', text: 'current question' }]
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

    expect(request.messages).toHaveLength(3)
    expect(request.messages[0]).toMatchObject({
      role: 'user',
      content: [{ type: 'input_text', text: 'previous user' }]
    })
    expect(request.messages[1]).toMatchObject({
      role: 'assistant',
      content: 'previous answer'
    })
    expect(request.messages[2]).toMatchObject({
      role: 'user'
    })

    const currentContent = request.messages[2].role === 'user'
      ? request.messages[2].content
      : []
    expect(currentContent[0]).toEqual({ type: 'input_text', text: 'current question' })
    expect(currentContent[1]).toMatchObject({
      type: 'input_text',
      text: expect.stringContaining('<request_context>')
    })
    expect((currentContent[1] as { text: string }).text).toContain('<system-environment>')
    expect((currentContent[1] as { text: string }).text).toContain('<user_info_context>')
    expect((currentContent[1] as { text: string }).text).toContain('<awake_state>')
  })

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

  it('compacts hot tool results that have already been consumed by a following assistant step', () => {
    const materializer = new DefaultRequestMaterializer()
    const largeContent = `tool-prefix-${'x'.repeat(40_000)}-tool-tail`
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
          toolName: 'read',
          status: 'success',
          replayMode: 'hot',
          content: largeContent
        },
        {
          recordId: 'assistant-1',
          kind: 'assistant_step',
          timestamp: 3,
          step: {
            stepId: 'step-2',
            stepIndex: 1,
            startedAt: 3,
            completedAt: 4,
            status: 'completed',
            content: 'used the tool result',
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

    expect(request.messages[0]).toMatchObject({
      role: 'tool',
      content: expect.stringContaining('[Tool result compacted for model request]'),
      toolCallId: 'call-1',
      toolName: 'read'
    })
    expect((request.messages[0] as { content: string }).content).toContain('tool-prefix-')
    expect((request.messages[0] as { content: string }).content).not.toContain('-tool-tail')

    const toolRecord = transcript.records[0]
    expect(toolRecord.kind).toBe('tool_result')
    if (toolRecord.kind !== 'tool_result') {
      throw new Error('Expected tool_result record')
    }
    expect(toolRecord.replayMode).toBe('hot')
    expect(toolRecord.content).toBe(largeContent)
  })

  it('uses normalized model content during protocol replay', () => {
    const materializer = new DefaultRequestMaterializer()
    const normalizedContent: NormalizedToolResultContent = {
      __atiToolResultNormalized: true,
      version: 1,
      toolName: 'read',
      toolCallId: 'call-1',
      status: 'success',
      summary: 'large result',
      original: {
        characters: 100_000,
        triggers: ['large_content']
      },
      artifacts: [],
      modelContent: '[normalized model content]'
    }
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
          toolName: 'read',
          status: 'success',
          content: normalizedContent
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
      content: '[normalized model content]',
      toolCallId: 'call-1',
      toolName: 'read'
    })
  })
})

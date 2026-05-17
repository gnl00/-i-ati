import { describe, expect, it } from 'vitest'
import { DefaultExecutableRequestAdapter } from '../ExecutableRequestAdapter'

describe('DefaultExecutableRequestAdapter', () => {
  it('carries assistant reasoning into unified chat messages', () => {
    const adapter = new DefaultExecutableRequestAdapter()

    const request = adapter.adapt({
      adapterPluginId: 'openai-chat-compatible-adapter',
      baseUrl: 'https://example.invalid/v1',
      apiKey: 'test-key',
      model: 'test-model',
      messages: [
        {
          role: 'assistant',
          content: 'answer',
          reasoning: 'thinking trace'
        }
      ]
    })

    expect(request.messages).toEqual([
      expect.objectContaining({
        role: 'assistant',
        content: 'answer',
        reasoning: 'thinking trace'
      })
    ])
    expect(request.messages[0]).not.toHaveProperty('segments')
  })

  it('maps tool result names to toolName in unified chat messages', () => {
    const adapter = new DefaultExecutableRequestAdapter()

    const request = adapter.adapt({
      adapterPluginId: 'openai-chat-compatible-adapter',
      baseUrl: 'https://example.invalid/v1',
      apiKey: 'test-key',
      model: 'test-model',
      messages: [
        {
          role: 'tool',
          content: 'tool output',
          toolCallId: 'tool-1',
          toolName: 'execute_command'
        }
      ]
    })

    expect(request.messages).toEqual([
      {
        role: 'tool',
        content: 'tool output',
        toolCallId: 'tool-1',
        toolName: 'execute_command'
      }
    ])
    expect(request.messages[0]).not.toHaveProperty('name')
  })
})

import { describe, expect, it, vi } from 'vitest'
import { OpenAIAdapter } from '../openai'
import { TOOL_CALL_REASON_PARAMETER_NAME } from '@shared/tools/definitions-utils'

vi.mock('@main/db/config', () => ({
  configDb: {
    getConfig: vi.fn(() => ({ tools: {} }))
  }
}))

describe('OpenAIAdapter request mapping', () => {
  it('maps thinking level to chat completions reasoning_effort', () => {
    const adapter = new OpenAIAdapter()

    const requestBody = adapter.buildRequest({
      adapterPluginId: 'openai-chat-compatible-adapter',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-5',
      stream: false,
      messages: [{ role: 'user', content: 'hello', segments: [] }],
      options: {
        thinkingLevel: 'high'
      }
    } as IUnifiedRequest)

    expect(adapter.getThinkingLevels()).toEqual(['none', 'minimal', 'low', 'medium', 'high', 'xhigh'])
    expect(requestBody.reasoning_effort).toBe('high')
    expect(requestBody.reasoning).toBeUndefined()
  })

  it('requires tool_call_reason in chat completions tool schemas', () => {
    const adapter = new OpenAIAdapter()

    const requestBody = adapter.buildRequest({
      adapterPluginId: 'openai-chat-compatible-adapter',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-5',
      stream: false,
      messages: [{ role: 'user', content: 'hello', segments: [] }],
      tools: [{
        name: 'search',
        description: 'Search',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' }
          },
          required: ['query']
        }
      }]
    } as IUnifiedRequest)

    const parameters = requestBody.tools[0].function.parameters
    expect(parameters.properties[TOOL_CALL_REASON_PARAMETER_NAME]).toEqual(expect.objectContaining({
      type: 'string',
      description: expect.stringContaining('same language the user is currently using')
    }))
    expect(parameters.required).toEqual(['query', TOOL_CALL_REASON_PARAMETER_NAME])
  })
})

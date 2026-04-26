import { describe, expect, it, vi } from 'vitest'
import { OpenAIAdapter } from '../openai'

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
})

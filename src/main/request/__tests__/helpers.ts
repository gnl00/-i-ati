import { createUnifiedRequest, type CreateUnifiedRequestInput } from '../UnifiedRequestFactory'

export const createTestUnifiedRequest = (
  overrides: Partial<CreateUnifiedRequestInput> = {}
): IUnifiedRequest => createUnifiedRequest({
  adapterPluginId: 'openai-chat-compatible-adapter',
  baseUrl: 'https://example.invalid/v1',
  apiKey: 'test-key',
  model: 'test-model',
  stream: false,
  messages: [{
    role: 'user',
    content: 'hello'
  }],
  ...overrides
})

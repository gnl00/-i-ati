import { beforeEach, describe, expect, it, vi } from 'vitest'
import { agent } from '../agent'

const {
  createUnifiedRequestMock,
  unifiedChatRequestMock,
  getToolsMock,
  getHandlerMock
} = vi.hoisted(() => ({
  createUnifiedRequestMock: vi.fn(),
  unifiedChatRequestMock: vi.fn(),
  getToolsMock: vi.fn((toolNames: string[]) => toolNames.map(toolName => ({
    type: 'function',
    function: {
      name: toolName,
      description: `Tool ${toolName}`,
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  }))),
  getHandlerMock: vi.fn()
}))

vi.mock('@main/request/UnifiedRequestFactory', () => ({
  createUnifiedRequest: createUnifiedRequestMock
}))

vi.mock('@main/request/index', () => ({
  unifiedChatRequest: unifiedChatRequestMock
}))

vi.mock('@tools/registry', () => ({
  embeddedToolsRegistry: {
    getTools: getToolsMock,
    getHandler: getHandlerMock
  }
}))

const model: AccountModel = {
  id: 'model-1',
  label: 'Model 1',
  type: 'llm'
}

const account: ProviderAccount = {
  id: 'account-1',
  providerId: 'provider-1',
  apiUrl: 'https://example.com/v1',
  apiKey: 'key'
}

const providerDefinition: ProviderDefinition = {
  id: 'provider-1',
  displayName: 'Provider 1',
  adapterPluginId: 'openai-chat-compatible-adapter',
  payloadExtensions: {
    thinking: 'deepseek-thinking'
  },
  requestOverrides: {
    temperature: 0.9,
    reasoning: 'minimal'
  }
}

describe('agent', () => {
  beforeEach(() => {
    createUnifiedRequestMock.mockReset()
    unifiedChatRequestMock.mockReset()
    getToolsMock.mockReset()
    getToolsMock.mockImplementation((toolNames: string[]) => toolNames.map(toolName => ({
      type: 'function',
      function: {
        name: toolName,
        description: `Tool ${toolName}`,
        parameters: {
          type: 'object',
          properties: {}
        }
      }
    })))
    getHandlerMock.mockReset()
  })

  it('builds unified request with system+user messages and sanitized overrides', async () => {
    unifiedChatRequestMock.mockResolvedValue({
      content: 'ok',
      toolCalls: []
    })

    const sanitizeOverrides = vi.fn(() => ({
      temperature: 0.5
    }))

    await agent(
      'agent-system',
      'System prompt',
      ['chat_set_title'],
      [{ role: 'user', content: 'hello' }],
      false,
      {
        model,
        account,
        providerDefinition,
        sanitizeOverrides,
        requestOptions: {
          thinking: {
            enabled: false
          },
          maxTokens: 120
        }
      }
    )

    expect(sanitizeOverrides).toHaveBeenCalledWith({ temperature: 0.9, reasoning: 'minimal' })
    expect(getToolsMock).toHaveBeenCalledWith(['chat_set_title'])
    expect(createUnifiedRequestMock).toHaveBeenCalledWith(expect.objectContaining({
      adapterPluginId: providerDefinition.adapterPluginId,
      baseUrl: account.apiUrl,
      apiKey: account.apiKey,
      model: model.id,
      modelType: model.type,
      messages: [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'hello' }
      ],
      stream: false,
      tools: [{
        type: 'function',
        function: {
          name: 'chat_set_title',
          description: 'Tool chat_set_title',
          parameters: {
            type: 'object',
            properties: {}
          }
        }
      }],
      payloadExtensions: {},
      requestOverrides: { temperature: 0.5 },
      options: {
        thinking: {
          enabled: false
        },
        maxTokens: 120
      }
    }))
    expect(createUnifiedRequestMock.mock.calls[0]?.[0]?.payloadExtensions?.thinking).toBeUndefined()
  })

  it('uses direct tool definitions without registry lookup when provided', async () => {
    const directToolDefinitions = [{
      type: 'function',
      function: {
        name: 'direct_tool',
        description: 'Direct tool',
        parameters: {}
      }
    }]
    const toolResult = { value: 123 }
    const handlerMock = vi.fn(async () => toolResult)
    getHandlerMock.mockImplementation((name: string) => {
      if (name === 'direct_tool') {
        return handlerMock
      }
      return undefined
    })

    unifiedChatRequestMock.mockResolvedValue({
      toolCalls: [{
        id: 'call-1',
        type: 'function',
        function: {
          name: 'direct_tool',
          arguments: JSON.stringify({ x: 1 })
        }
      }]
    })

    const result = await agent(
      'agent-direct-tools',
      'System prompt',
      ['ignored_name'],
      [{ role: 'user', content: 'input' }],
      false,
      {
        model,
        account,
        providerDefinition,
        toolDefinitions: directToolDefinitions
      }
    )

    expect(getToolsMock).not.toHaveBeenCalled()
    expect(createUnifiedRequestMock).toHaveBeenCalledWith(expect.objectContaining({
      tools: directToolDefinitions
    }))
    expect(result).toEqual(expect.objectContaining({
      type: 'tool_call',
      toolCalls: [{
        name: 'direct_tool',
        args: { x: 1 },
        result: toolResult,
        success: true
      }]
    }))
  })

  it('returns tool_call for a single non-loop tool call', async () => {
    const handlerMock = vi.fn(async () => ({ value: 1 }))
    getHandlerMock.mockImplementation((name: string) => {
      if (name === 'chat_set_title') {
        return handlerMock
      }
      return undefined
    })

    unifiedChatRequestMock.mockResolvedValue({
      toolCalls: [{
        id: 'call-1',
        type: 'function',
        function: {
          name: 'chat_set_title',
          arguments: JSON.stringify({ title: 'Hi' })
        }
      }]
    })

    const result = await agent(
      'title-generator',
      'System',
      ['chat_set_title'],
      [{ role: 'user', content: 'title' }],
      false,
      {
        model,
        account,
        providerDefinition
      }
    )

    expect(result.type).toBe('tool_call')
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls?.[0]).toEqual({
      name: 'chat_set_title',
      args: { title: 'Hi' },
      result: { value: 1 },
      success: true
    })
    expect(handlerMock).toHaveBeenCalledWith({ title: 'Hi' })
    expect(unifiedChatRequestMock).toHaveBeenCalledTimes(1)
  })

  it('uses registry lookup for string tool names and supports empty tool lists', async () => {
    unifiedChatRequestMock.mockResolvedValue({
      content: 'Summary'
    })

    await agent(
      'summarizer',
      'System',
      ['chat_set_title'],
      [{ role: 'user', content: 'x' }],
      false,
      {
        model,
        account,
        providerDefinition
      }
    )

    expect(getToolsMock).toHaveBeenCalledWith(['chat_set_title'])

    createUnifiedRequestMock.mockClear()
    unifiedChatRequestMock.mockClear()

    const emptyToolsResult = await agent(
      'summarizer',
      'System',
      [],
      [{ role: 'user', content: 'compress' }],
      false,
      {
        model,
        account,
        providerDefinition
      }
    )

    expect(getToolsMock).toHaveBeenCalledTimes(1)
    expect(createUnifiedRequestMock).toHaveBeenCalledWith(expect.objectContaining({
      tools: []
    }))
    expect(emptyToolsResult.type).toBe('text')
  })

  it('loops with tool call execution and returns final text response', async () => {
    const handlerMock = vi.fn(async (args: any) => ({
      result: `query:${args.query}`
    }))
    getHandlerMock.mockImplementation((name: string) => {
      if (name === 'web_search') {
        return handlerMock
      }
      return undefined
    })

    unifiedChatRequestMock
      .mockResolvedValueOnce({
        toolCalls: [{
          id: 'call-1',
          type: 'function',
          function: {
            name: 'web_search',
            arguments: JSON.stringify({ query: 'OpenAI' })
          }
        }],
        usage: {
          promptTokens: 6,
          completionTokens: 3,
          totalTokens: 9,
          promptCacheHitTokens: 0,
          promptCacheMissTokens: 0,
          promptCacheWriteTokens: 0,
          reasoningTokens: 0
        }
      })
      .mockResolvedValueOnce({
        content: 'Final result',
        usage: {
          promptTokens: 5,
          completionTokens: 0,
          totalTokens: 5,
          promptCacheHitTokens: 0,
          promptCacheMissTokens: 0,
          promptCacheWriteTokens: 0,
          reasoningTokens: 0
        }
      })

    const result = await agent(
      'researcher',
      'Loop prompt',
      ['web_search'],
      [{ role: 'user', content: 'search' }],
      true,
      {
        model,
        account,
        providerDefinition
      }
    )

    expect(handlerMock).toHaveBeenCalledWith({ query: 'OpenAI' })
    expect(unifiedChatRequestMock).toHaveBeenCalledTimes(2)
    expect(createUnifiedRequestMock).toHaveBeenCalledTimes(2)
    const secondRequest = createUnifiedRequestMock.mock.calls[1]?.[0]
    expect(secondRequest?.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'assistant',
          content: '',
          toolCalls: expect.arrayContaining([
            expect.objectContaining({
              id: 'call-1',
              function: {
                name: 'web_search',
                arguments: JSON.stringify({ query: 'OpenAI' })
              }
            })
          ])
        }),
        expect.objectContaining({
          role: 'tool',
          toolCallId: 'call-1',
          toolName: 'web_search',
          content: JSON.stringify({ result: 'query:OpenAI' })
        })
      ])
    )
    expect(result).toEqual({
      type: 'text',
      content: 'Final result',
      usage: {
        promptTokens: 11,
        completionTokens: 0,
        totalTokens: 14,
        promptCacheHitTokens: 0,
        promptCacheMissTokens: 0,
        promptCacheWriteTokens: 0,
        reasoningTokens: 0
      }
    })
  })

  it('surfaces parse error as failed tool result and keeps loop false behavior', async () => {
    getHandlerMock.mockImplementation(() => undefined)

    unifiedChatRequestMock.mockResolvedValue({
      toolCalls: [{
        id: 'call-invalid',
        type: 'function',
        function: {
          name: 'chat_set_title',
          arguments: '{ not-json }'
        }
      }]
    })

    const result = await agent(
      'title-generator',
      'Bad JSON prompt',
      ['chat_set_title'],
      [{ role: 'user', content: 'title' }],
      false,
      {
        model,
        account,
        providerDefinition
      }
    )

    expect(result.type).toBe('tool_call')
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls?.[0]).toEqual(expect.objectContaining({
      name: 'chat_set_title',
      args: {},
      success: false
    }))
    expect(result.toolCalls?.[0]?.error).toBeDefined()
  })

  it('stops loop after max rounds and returns collected tool calls', async () => {
    const handlerMock = vi.fn(async () => ({ ok: true }))
    getHandlerMock.mockImplementation(() => handlerMock)

    unifiedChatRequestMock.mockResolvedValue({
      toolCalls: [{
        id: 'loop',
        type: 'function',
        function: {
          name: 'chat_set_title',
          arguments: '{}'
        }
      }]
    })

    const result = await agent(
      'tight-loop',
      'Loop forever',
      ['chat_set_title'],
      [{ role: 'user', content: 'x' }],
      true,
      {
        model,
        account,
        providerDefinition
      }
    )

    expect(unifiedChatRequestMock).toHaveBeenCalledTimes(25)
    expect(result.type).toBe('tool_call')
    expect(result.toolCalls).toHaveLength(25)
  })

  it('returns text when no tool calls', async () => {
    unifiedChatRequestMock.mockResolvedValue({
      content: 'Summary',
      usage: {
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
        promptCacheHitTokens: 0,
        promptCacheMissTokens: 0,
        promptCacheWriteTokens: 0,
        reasoningTokens: 0
      }
    })

    const result = await agent(
      'summarizer',
      '',
      [],
      [{ role: 'user', content: 'compress' }],
      true,
      {
        model,
        account,
        providerDefinition
      }
    )

    expect(result).toEqual({
      type: 'text',
      content: 'Summary',
      usage: {
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
        promptCacheHitTokens: 0,
        promptCacheMissTokens: 0,
        promptCacheWriteTokens: 0,
        reasoningTokens: 0
      }
    })
  })

  it('returns error when request fails', async () => {
    unifiedChatRequestMock.mockRejectedValueOnce(new Error('network down'))

    const result = await agent(
      'summarizer',
      '',
      [],
      [{ role: 'user', content: 'ask' }],
      false,
      {
        model,
        account,
        providerDefinition
      }
    )

    expect(result).toEqual({
      type: 'error',
      error: 'network down',
      usage: undefined
    })
  })
})

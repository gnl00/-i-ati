import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  build: vi.fn(),
  getConfig: vi.fn(),
  getMcp: vi.fn(),
  connect: vi.fn()
}))
vi.mock('@main/db/config', () => ({
  configDb: { getConfig: mocks.getConfig, getMcpServerConfig: mocks.getMcp }
}))
vi.mock('@main/hosts/chat/preparation/RunRequestFactory', () => ({
  RunRequestFactory: class {
    build = mocks.build
  }
}))
vi.mock('@main/services/mcpRuntime', () => ({
  mcpRuntimeService: { connectServer: mocks.connect }
}))

import { prepareCliChatProfile } from '../CliChatProfile'

describe('CLI Chat profile parity', () => {
  const modelConfig = {
    adapterPluginId: 'openai-chat-compatible-adapter',
    baseUrl: 'https://example.test/v1',
    apiKey: 'primary-secret',
    apiKeyEnv: 'TEST_KEY',
    model: 'model',
    options: { thinking: { enabled: true, effort: 'high' } }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getConfig.mockReturnValue({
      tools: { visionModel: { accountId: 'vision', modelId: 'vision-model' } },
      accounts: [
        {
          id: 'primary',
          providerId: 'provider',
          apiUrl: modelConfig.baseUrl,
          apiKey: 'primary-secret',
          models: [{ id: 'model', type: 'llm', contextWindowTokens: 100000 }]
        },
        { id: 'vision', apiKey: 'vision-secret', models: [] }
      ],
      providerDefinitions: [
        {
          id: 'provider',
          adapterPluginId: modelConfig.adapterPluginId,
          payloadExtensions: { thinking: '{"thinking":{{value}}}' },
          requestOverrides: { temperature: 0.2 }
        }
      ]
    })
    mocks.getMcp.mockReturnValue({
      mcpServers: { search: { command: 'search-server', enabled: true },
        disabled: { command: 'disabled', enabled: false },
        legacy: { command: 'legacy' } }
    })
    mocks.connect.mockResolvedValue({
      result: true,
      tools: [
        {
          type: 'function',
          source: 'mcp',
          serverName: 'search',
          originalName: 'search',
          function: { name: 'mcp_search' }
        }
      ]
    })
    mocks.build.mockResolvedValue({
      requestSpec: {
        systemPrompt: 'Chat prompt',
        tools: [{ name: 'image_analyze' }, { name: 'mcp_search' }]
      },
      contextMessages: [{ role: 'user', content: 'task' }]
    })
  })

  it('resolves configured model capabilities and MCP inputs for shared preparation', async () => {
    const profile = await prepareCliChatProfile(modelConfig)
    expect(profile.modelContext).toMatchObject({
          model: { contextWindowTokens: 100000 },
          providerDefinition: {
            requestOverrides: { temperature: 0.2 },
            payloadExtensions: expect.any(Object)
          }
    })
    expect(profile.tools).toEqual([
          {
            name: 'mcp_search',
            source: 'mcp',
            serverName: 'search',
            originalName: 'search'
          }
        ])
    expect(profile.options).toEqual(modelConfig.options)
    expect(profile.modelRef).toEqual({
      accountId: 'primary',
      modelId: 'model'
    })
    expect(profile.secrets).toContain('vision-secret')
    expect(mocks.connect).toHaveBeenCalledExactlyOnceWith({ name: 'search', command: 'search-server', enabled: true })
    expect(mocks.build).not.toHaveBeenCalled()
  })

  it('preserves explicit enabled thinking when no effort is provided', async () => {
    const profile = await prepareCliChatProfile({
      ...modelConfig,
      options: { thinking: { enabled: true } }
    })

    expect(profile.options).toEqual({
      thinking: { enabled: true }
    })
  })

  it('preserves explicit CLI prompt and provider overrides', async () => {
    const profile = await prepareCliChatProfile({
      ...modelConfig,
      systemPrompt: 'Run override',
      requestOverrides: { temperature: 0 }
    })
    expect(profile.systemPrompt).toBe('Run override')
    expect(profile.modelContext.providerDefinition.requestOverrides).toEqual({
      temperature: 0
    })
  })

  it('reports a configured MCP startup failure instead of silently reducing the tool set', async () => {
    mocks.connect.mockResolvedValue({ result: false })
    await expect(prepareCliChatProfile(modelConfig)).rejects.toThrow(
      'CLI MCP connection failed: search'
    )
    expect(mocks.build).not.toHaveBeenCalled()
  })
})

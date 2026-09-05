import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ build: vi.fn(), getConfig: vi.fn(), getMcp: vi.fn(), connect: vi.fn() }))
vi.mock('@main/db/config', () => ({ configDb: { getConfig: mocks.getConfig, getMcpServerConfig: mocks.getMcp } }))
vi.mock('@main/hosts/chat/preparation/RunRequestFactory', () => ({
  RunRequestFactory: class { build = mocks.build }
}))
vi.mock('@main/services/mcpRuntime', () => ({ mcpRuntimeService: { connectServer: mocks.connect } }))

import { prepareCliChatProfile } from '../CliChatProfile'

describe('CLI Chat profile parity', () => {
  const modelConfig = {
    adapterPluginId: 'openai-chat-compatible-adapter', baseUrl: 'https://example.test/v1',
    apiKey: 'primary-secret', apiKeyEnv: 'TEST_KEY', model: 'model',
    options: { thinking: { enabled: true, effort: 'high' } }
  }
  const chat = { id: 1, uuid: 'cli:test', workspacePath: '/workspace' } as ChatEntity

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getConfig.mockReturnValue({
      tools: { visionModel: { accountId: 'vision', modelId: 'vision-model' } },
      accounts: [
        { id: 'primary', providerId: 'provider', apiUrl: modelConfig.baseUrl,
          apiKey: 'primary-secret', models: [{ id: 'model', type: 'llm', contextWindowTokens: 100000 }] },
        { id: 'vision', apiKey: 'vision-secret', models: [] }
      ],
      providerDefinitions: [{ id: 'provider', adapterPluginId: modelConfig.adapterPluginId,
        payloadExtensions: { thinking: '{"thinking":{{value}}}' }, requestOverrides: { temperature: 0.2 } }]
    })
    mocks.getMcp.mockReturnValue({ mcpServers: { search: { command: 'search-server' } } })
    mocks.connect.mockResolvedValue({ result: true, tools: [{ name: 'mcp_search' }] })
    mocks.build.mockResolvedValue({
      requestSpec: { systemPrompt: 'Chat prompt', tools: [{ name: 'vision_analyze' }, { name: 'mcp_search' }] },
      initialTranscriptSeed: [{ kind: 'user', content: 'task' }]
    })
  })

  it('delegates configuration, context and unrestricted tools to the Chat request factory', async () => {
    const profile = await prepareCliChatProfile(chat, 'task', modelConfig)
    expect(mocks.build).toHaveBeenCalledWith(
      expect.objectContaining({ modelContext: expect.objectContaining({
        model: expect.objectContaining({ contextWindowTokens: 100000 }),
        providerDefinition: expect.objectContaining({ requestOverrides: { temperature: 0.2 }, payloadExtensions: expect.any(Object) })
      }) }), expect.any(Object),
      expect.objectContaining({ textCtx: 'task', tools: [{ name: 'mcp_search' }], options: modelConfig.options })
    )
    expect(mocks.build.mock.calls[0][2].source).toBeUndefined()
    expect(profile.requestSpec.tools).toEqual([{ name: 'vision_analyze' }, { name: 'mcp_search' }])
    expect(profile.modelRef).toEqual({ accountId: 'primary', modelId: 'model' })
    expect(profile.secrets).toContain('vision-secret')
  })

  it('preserves explicit enabled thinking when no effort is provided', async () => {
    const profile = await prepareCliChatProfile(chat, 'task', {
      ...modelConfig,
      options: { thinking: { enabled: true } }
    })

    expect(profile.requestSpec.options).toEqual({ thinking: { enabled: true } })
  })

  it('preserves explicit CLI prompt and provider overrides', async () => {
    const profile = await prepareCliChatProfile(chat, 'task', {
      ...modelConfig, systemPrompt: 'Run override', requestOverrides: { temperature: 0 }
    })
    expect(profile.requestSpec.systemPrompt).toBe('Run override')
    expect(mocks.build.mock.calls[0][0].modelContext.providerDefinition.requestOverrides).toEqual({ temperature: 0 })
  })

  it('reports a configured MCP startup failure instead of silently reducing the tool set', async () => {
    mocks.connect.mockResolvedValue({ result: false })
    await expect(prepareCliChatProfile(chat, 'task', modelConfig)).rejects.toThrow('CLI MCP connection failed: search')
    expect(mocks.build).not.toHaveBeenCalled()
  })
})

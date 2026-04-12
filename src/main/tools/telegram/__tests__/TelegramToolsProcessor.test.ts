import { beforeEach, describe, expect, it, vi } from 'vitest'
import { processTelegramSetupTool } from '../TelegramToolsProcessor'

const {
  getConfigMock,
  initConfigMock,
  saveConfigMock,
  startWithTokenMock,
  stopMock,
  getStatusMock
} = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  initConfigMock: vi.fn(),
  saveConfigMock: vi.fn(),
  startWithTokenMock: vi.fn(),
  stopMock: vi.fn(),
  getStatusMock: vi.fn()
}))

vi.mock('@main/db/config', () => ({
  configDb: {
    getConfig: getConfigMock,
    initConfig: initConfigMock,
    saveConfig: saveConfigMock
  }
}))

vi.mock('@main/services/telegram', () => ({
  telegramGatewayService: {
    startWithToken: startWithTokenMock,
    stop: stopMock,
    getStatus: getStatusMock
  }
}))

describe('TelegramToolsProcessor', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    startWithTokenMock.mockResolvedValue(undefined)
    getStatusMock.mockReturnValue({
      running: true,
      starting: false,
      configured: true,
      enabled: true,
      botUsername: 'ati_bot',
      botId: '123'
    })
  })

  it('requires bot_token', async () => {
    const result = await processTelegramSetupTool({})

    expect(result.success).toBe(false)
    expect(result.message).toContain('bot_token')
    expect(startWithTokenMock).not.toHaveBeenCalled()
    expect(saveConfigMock).not.toHaveBeenCalled()
  })

  it('starts gateway and saves telegram config after startup', async () => {
    const config = {
      version: 2,
      providerDefinitions: [
        {
          id: 'openrouter',
          displayName: 'OpenRouter',
          adapterPluginId: 'openai-response-compatible-adapter'
        }
      ],
      accounts: [
        {
          id: 'acc-1',
          providerId: 'openrouter',
          label: 'OpenRouter Main',
          apiUrl: 'https://openrouter.ai/api/v1',
          apiKey: 'sk-test',
          models: []
        }
      ],
      tools: {
        defaultModel: {
          accountId: 'acc-1',
          modelId: 'gpt-5.4'
        }
      },
      telegram: {
        enabled: false,
        mode: 'polling',
        dmPolicy: 'open'
      }
    }
    getConfigMock.mockReturnValue(config)

    const result = await processTelegramSetupTool({
      bot_token: ' 123:abc '
    })

    expect(startWithTokenMock).toHaveBeenCalledWith('123:abc')
    expect(saveConfigMock).toHaveBeenCalledWith({
      version: 2,
      tools: config.tools,
      telegram: {
        ...config.telegram,
        enabled: true,
        botToken: '123:abc',
        mode: 'polling'
      }
    })
    expect(result.success).toBe(true)
    expect(result.botUsername).toBe('ati_bot')
  })

  it('does not save config when startup fails', async () => {
    getConfigMock.mockReturnValue({ version: 2, tools: {} })
    startWithTokenMock.mockRejectedValue(new Error('bad token'))

    const result = await processTelegramSetupTool({
      bot_token: 'bad-token'
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('bad token')
    expect(saveConfigMock).not.toHaveBeenCalled()
  })

  it('stops gateway when config save fails after startup', async () => {
    getConfigMock.mockReturnValue({ version: 2, tools: {}, telegram: {} })
    saveConfigMock.mockImplementation(() => {
      throw new Error('disk full')
    })

    const result = await processTelegramSetupTool({
      bot_token: '123:abc'
    })

    expect(stopMock).toHaveBeenCalledTimes(1)
    expect(result.success).toBe(false)
    expect(result.message).toContain('disk full')
  })
})

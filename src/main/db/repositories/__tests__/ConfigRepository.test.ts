import { describe, expect, it, vi } from 'vitest'
import { ConfigRepository } from '../ConfigRepository'

describe('ConfigRepository', () => {
  it('hydrates provider definitions and accounts from ProviderRepository', () => {
    const configRepo = {
      getConfig: vi.fn().mockReturnValue({
        value: JSON.stringify({
          version: 2,
          tools: {
            maxWebSearchItems: 3
          }
        })
      })
    }
    const providerRepository = {
      getProviderDefinitions: vi.fn().mockReturnValue([{
        id: 'openai',
        displayName: 'OpenAI',
        adapterPluginId: 'openai-chat-compatible-adapter'
      }]),
      getProviderAccounts: vi.fn().mockReturnValue([{
        id: 'acct-openai',
        providerId: 'openai',
        label: 'Primary',
        apiUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        models: []
      }])
    }

    const service = new ConfigRepository({
      hasDb: () => true,
      getConfigRepo: () => configRepo as unknown as any,
      providerRepository: () => providerRepository as unknown as any
    })

    expect(service.getConfig()).toEqual({
      version: 2,
      tools: {
        maxWebSearchItems: 3
      },
      providerDefinitions: [{
        id: 'openai',
        displayName: 'OpenAI',
        adapterPluginId: 'openai-chat-compatible-adapter'
      }],
      accounts: [{
        id: 'acct-openai',
        providerId: 'openai',
        label: 'Primary',
        apiUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        models: []
      }]
    })
  })

  it('persists provider collections through ProviderRepository and strips them from the config payload', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1710000000000)
    const saveConfig = vi.fn()
    const providerRepository = {
      saveProviderDefinitionsToDb: vi.fn(),
      saveProviderAccountsToDb: vi.fn()
    }

    const service = new ConfigRepository({
      hasDb: () => true,
      getConfigRepo: () => ({
        saveConfig
      }) as unknown as any,
      providerRepository: () => providerRepository as unknown as any
    })

    service.saveConfig({
      version: 2,
      tools: {
        maxWebSearchItems: 3
      },
      providerDefinitions: [{
        id: 'openai',
        displayName: 'OpenAI',
        adapterPluginId: 'openai-chat-compatible-adapter'
      }],
      accounts: [{
        id: 'acct-openai',
        providerId: 'openai',
        label: 'Primary',
        apiUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        models: []
      }]
    })

    expect(providerRepository.saveProviderDefinitionsToDb).toHaveBeenCalledWith([{
      id: 'openai',
      displayName: 'OpenAI',
      adapterPluginId: 'openai-chat-compatible-adapter'
    }])
    expect(providerRepository.saveProviderAccountsToDb).toHaveBeenCalledWith([{
      id: 'acct-openai',
      providerId: 'openai',
      label: 'Primary',
      apiUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      models: []
    }])
    expect(saveConfig).toHaveBeenCalledWith(
      JSON.stringify({
        version: 2,
        tools: {
          maxWebSearchItems: 3
        }
      }),
      2,
      1710000000000
    )
  })

  it('normalizes legacy model slots when loading config JSON', () => {
    const configRepo = {
      getConfig: vi.fn().mockReturnValue({
        value: JSON.stringify({
          version: 2,
          tools: {
            defaultModel: {
              accountId: 'acct-main',
              modelId: 'gpt-main'
            },
            titleGenerateModel: {
              accountId: 'acct-lite',
              modelId: 'gpt-lite'
            },
            titleGenerateEnabled: false,
            maxWebSearchItems: 3
          }
        })
      })
    }
    const providerRepository = {
      getProviderDefinitions: vi.fn().mockReturnValue([]),
      getProviderAccounts: vi.fn().mockReturnValue([])
    }

    const service = new ConfigRepository({
      hasDb: () => true,
      getConfigRepo: () => configRepo as unknown as any,
      providerRepository: () => providerRepository as unknown as any
    })

    expect(service.getConfig()?.tools).toEqual({
      mainModel: {
        accountId: 'acct-main',
        modelId: 'gpt-main'
      },
      liteModel: {
        accountId: 'acct-lite',
        modelId: 'gpt-lite'
      },
      maxWebSearchItems: 3
    })
  })

  it('strips legacy model slots when saving config JSON', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1710000000001)
    const saveConfig = vi.fn()

    const service = new ConfigRepository({
      hasDb: () => true,
      getConfigRepo: () => ({
        saveConfig
      }) as unknown as any,
      providerRepository: () => ({
        saveProviderDefinitionsToDb: vi.fn(),
        saveProviderAccountsToDb: vi.fn()
      }) as unknown as any
    })

    service.saveConfig({
      version: 2,
      tools: {
        defaultModel: {
          accountId: 'acct-main',
          modelId: 'gpt-main'
        },
        titleGenerateModel: {
          accountId: 'acct-lite',
          modelId: 'gpt-lite'
        },
        titleGenerateEnabled: false,
        maxWebSearchItems: 4
      }
    } as unknown as IAppConfig)

    expect(saveConfig).toHaveBeenCalledWith(
      expect.any(String),
      2,
      1710000000001
    )
    expect(JSON.parse(saveConfig.mock.calls[0][0])).toEqual({
      version: 2,
      tools: {
        mainModel: {
          accountId: 'acct-main',
          modelId: 'gpt-main'
        },
        liteModel: {
          accountId: 'acct-lite',
          modelId: 'gpt-lite'
        },
        maxWebSearchItems: 4
      }
    })
  })

  it('normalizes legacy model slots while updating config version', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1710000000002)
    const saveConfig = vi.fn()
    const providerDefinitions: ProviderDefinition[] = [{
      id: 'openai',
      displayName: 'OpenAI',
      adapterPluginId: 'openai-chat-compatible-adapter'
    }]
    const accounts: ProviderAccount[] = [{
      id: 'acct-main',
      providerId: 'openai',
      label: 'Primary',
      apiUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      models: []
    }]
    const providerRepository = {
      getProviderDefinitions: vi.fn().mockReturnValue(providerDefinitions),
      getProviderAccounts: vi.fn().mockReturnValue(accounts),
      countProviderDefinitions: vi.fn().mockReturnValue(1),
      ensureProviderDefinitions: vi.fn(),
      saveProviderDefinitionsToDb: vi.fn(),
      saveProviderAccountsToDb: vi.fn()
    }

    const service = new ConfigRepository({
      hasDb: () => true,
      getConfigRepo: () => ({
        getConfig: vi.fn().mockReturnValue({
          value: JSON.stringify({
            version: 1,
            tools: {
              defaultModel: {
                accountId: 'acct-main',
                modelId: 'gpt-main'
              },
              titleGenerateModel: {
                accountId: 'acct-lite',
                modelId: 'gpt-lite'
              },
              titleGenerateEnabled: true
            }
          })
        }),
        saveConfig
      }) as unknown as any,
      providerRepository: () => providerRepository as unknown as any
    })

    const config = service.initConfig()

    expect(config.tools).toEqual({
      mainModel: {
        accountId: 'acct-main',
        modelId: 'gpt-main'
      },
      liteModel: {
        accountId: 'acct-lite',
        modelId: 'gpt-lite'
      }
    })
    expect(saveConfig).toHaveBeenCalledWith(
      expect.any(String),
      2,
      1710000000002
    )
    expect(JSON.parse(saveConfig.mock.calls[0][0])).toEqual({
      version: 2,
      tools: {
        mainModel: {
          accountId: 'acct-main',
          modelId: 'gpt-main'
        },
        liteModel: {
          accountId: 'acct-lite',
          modelId: 'gpt-lite'
        }
      }
    })
  })

  it('passes explicit updatedAt when saving a config value', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1710000001234)
    const saveValue = vi.fn()

    const service = new ConfigRepository({
      hasDb: () => true,
      getConfigRepo: () => ({
        saveValue
      }) as unknown as any,
      providerRepository: () => ({
        getProviderDefinitions: vi.fn().mockReturnValue([]),
        getProviderAccounts: vi.fn().mockReturnValue([])
      }) as unknown as any
    })

    service.saveConfigValue('feature.flag', 'enabled', 3)

    expect(saveValue).toHaveBeenCalledWith('feature.flag', 'enabled', 3, 1710000001234)
  })
})

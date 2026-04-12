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

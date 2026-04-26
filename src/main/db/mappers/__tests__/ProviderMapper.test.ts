import { describe, expect, it } from 'vitest'
import {
  toAccountModelEntity,
  toProviderAccountEntity,
  toProviderAccountRow,
  toProviderDefinitionEntity,
  toProviderDefinitionRow,
  toProviderModelRow
} from '../ProviderMapper'

describe('providerMapper', () => {
  it('maps provider definition rows and entities', () => {
    expect(toProviderDefinitionEntity({
      id: 'openai',
      display_name: 'OpenAI',
      adapter_plugin_id: 'openai-chat-compatible-adapter',
      enabled: 1,
      icon_key: 'openai',
      default_api_url: 'https://api.openai.com/v1',
      request_overrides: JSON.stringify({ temperature: 0.2 }),
      created_at: 1,
      updated_at: 2
    })).toEqual({
      id: 'openai',
      displayName: 'OpenAI',
      adapterPluginId: 'openai-chat-compatible-adapter',
      enabled: true,
      iconKey: 'openai',
      defaultApiUrl: 'https://api.openai.com/v1',
      requestOverrides: { temperature: 0.2 }
    })

    expect(toProviderDefinitionRow({
      id: 'openai',
      displayName: 'OpenAI',
      adapterPluginId: 'openai-chat-compatible-adapter',
      enabled: false,
      iconKey: 'openai',
      defaultApiUrl: 'https://api.openai.com/v1',
      requestOverrides: { temperature: 0.2 }
    }, 10)).toEqual({
      id: 'openai',
      display_name: 'OpenAI',
      adapter_plugin_id: 'openai-chat-compatible-adapter',
      enabled: 0,
      icon_key: 'openai',
      default_api_url: 'https://api.openai.com/v1',
      request_overrides: JSON.stringify({ temperature: 0.2 }),
      created_at: 10,
      updated_at: 10
    })
  })

  it('maps provider accounts and models', () => {
    const model = toAccountModelEntity({
      account_id: 'acct-1',
      model_id: 'gpt-4.1',
      label: 'GPT-4.1',
      type: 'llm',
      modalities_json: JSON.stringify(['text', 'image']),
      enabled: 1,
      created_at: 1,
      updated_at: 2
    })

    expect(model).toEqual({
      id: 'gpt-4.1',
      label: 'GPT-4.1',
      type: 'llm',
      modalities: ['text', 'image'],
      enabled: true
    })

    expect(toProviderAccountEntity({
      id: 'acct-1',
      provider_id: 'openai',
      label: 'Primary',
      api_url: 'https://api.openai.com/v1',
      api_key: 'sk-test',
      created_at: 1,
      updated_at: 2
    }, [model])).toEqual({
      id: 'acct-1',
      providerId: 'openai',
      label: 'Primary',
      apiUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      models: [model]
    })

    expect(toProviderAccountRow({
      id: 'acct-1',
      providerId: 'openai',
      label: 'Primary',
      apiUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      models: []
    }, 10)).toEqual({
      id: 'acct-1',
      provider_id: 'openai',
      label: 'Primary',
      api_url: 'https://api.openai.com/v1',
      api_key: 'sk-test',
      created_at: 10,
      updated_at: 10
    })

    expect(toProviderModelRow('acct-1', {
      id: 'gpt-4.1',
      label: 'GPT-4.1',
      type: 'llm',
      modalities: ['text', 'image'],
      enabled: true
    }, 10)).toEqual({
      account_id: 'acct-1',
      model_id: 'gpt-4.1',
      label: 'GPT-4.1',
      type: 'llm',
      modalities_json: JSON.stringify(['text', 'image']),
      enabled: 1,
      created_at: 10,
      updated_at: 10
    })
  })
})

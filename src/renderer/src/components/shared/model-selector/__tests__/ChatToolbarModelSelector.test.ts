import { describe, expect, it } from 'vitest'
import type { ModelOption } from '@renderer/store/appConfig'
import { resolveChatToolbarModelSelection } from '../ChatToolbarModelSelector'

const plugin: PluginEntity = {
  pluginId: 'openai-chat-compatible-adapter',
  name: 'OpenAI Chat Compatible Adapter',
  source: 'built-in',
  enabled: true,
  status: 'installed',
  capabilities: [{
    kind: 'request-adapter',
    data: {
      providerType: 'openai',
      modelTypes: ['llm'],
      thinking: {
        levels: ['low', 'medium', 'high'],
        defaultLevel: 'medium'
      }
    }
  }]
}

const createModelOption = (
  model: Partial<AccountModel>,
  adapterPluginId = 'openai-chat-compatible-adapter'
): ModelOption => ({
  account: {
    id: 'account-1',
    label: 'OpenAI',
    providerId: 'openai',
    apiUrl: 'https://api.openai.com/v1',
    apiKey: 'test-key',
    models: []
  } as ProviderAccount,
  definition: {
    id: 'openai',
    displayName: 'OpenAI',
    adapterPluginId
  } as ProviderDefinition,
  model: {
    id: 'gpt-5',
    label: 'GPT-5',
    type: 'llm',
    ...model
  } as AccountModel
})

describe('resolveChatToolbarModelSelection', () => {
  it('uses medium for reasoning models when no level is requested', () => {
    const selection = resolveChatToolbarModelSelection(
      createModelOption({ capabilities: ['reasoning'] }),
      [plugin]
    )

    expect(selection).toEqual({
      ref: { accountId: 'account-1', modelId: 'gpt-5' },
      thinkingLevel: 'medium'
    })
  })

  it('uses the requested level for reasoning models', () => {
    const selection = resolveChatToolbarModelSelection(
      createModelOption({ capabilities: ['reasoning'] }),
      [plugin],
      'high'
    )

    expect(selection.thinkingLevel).toBe('high')
  })

  it('clears thinking level for models without reasoning support', () => {
    const selection = resolveChatToolbarModelSelection(
      createModelOption({ id: 'gpt-4o', label: 'GPT-4o' }),
      [plugin],
      'high'
    )

    expect(selection).toEqual({
      ref: { accountId: 'account-1', modelId: 'gpt-4o' },
      thinkingLevel: undefined
    })
  })
})

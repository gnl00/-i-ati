import { describe, expect, it } from 'vitest'
import type { ModelOption } from '@renderer/shared/config/modelTypes'
import {
  filterModelSelectorGroups,
  groupModelSelectorOptions,
  resolveChatToolbarModelSelection
} from '../ChatToolbarModelSelector.utils'
import { getChatToolbarModelSelectorTriggerClassName } from '../ChatToolbarModelSelector'

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
  adapterPluginId = 'openai-chat-compatible-adapter',
  overrides: {
    account?: Partial<ProviderAccount>
    definition?: Partial<ProviderDefinition>
  } = {}
): ModelOption => ({
  account: {
    id: 'account-1',
    label: 'OpenAI',
    providerId: 'openai',
    apiUrl: 'https://api.openai.com/v1',
    apiKey: 'test-key',
    models: [],
    ...overrides.account
  } as ProviderAccount,
  definition: {
    id: 'openai',
    displayName: 'OpenAI',
    adapterPluginId,
    ...overrides.definition
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

describe('filterModelSelectorGroups', () => {
  it('filters models by label or id', () => {
    const groups = groupModelSelectorOptions([
      createModelOption({ id: 'gpt-5', label: 'GPT-5' }),
      createModelOption({ id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' })
    ])

    const filteredGroups = filterModelSelectorGroups(groups, 'flash')

    expect(filteredGroups).toHaveLength(1)
    expect(filteredGroups[0].options.map(option => option.model.id)).toEqual(['deepseek-v4-flash'])
  })

  it('keeps all group models when provider matches query', () => {
    const groups = groupModelSelectorOptions([
      createModelOption({ id: 'gpt-5', label: 'GPT-5' }, 'openai-chat-compatible-adapter', {
        account: { id: 'deepseek-account', label: 'DeepSeek Primary', providerId: 'deepseek' },
        definition: { id: 'deepseek', displayName: 'DeepSeek' }
      }),
      createModelOption({ id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' }, 'openai-chat-compatible-adapter', {
        account: { id: 'deepseek-account', label: 'DeepSeek Primary', providerId: 'deepseek' },
        definition: { id: 'deepseek', displayName: 'DeepSeek' }
      })
    ])

    const filteredGroups = filterModelSelectorGroups(groups, 'primary')

    expect(filteredGroups).toHaveLength(1)
    expect(filteredGroups[0].options.map(option => option.model.id)).toEqual([
      'gpt-5',
      'deepseek-v4-flash'
    ])
  })

  it('normalizes case and surrounding spaces', () => {
    const groups = groupModelSelectorOptions([
      createModelOption({ id: 'gpt-5', label: 'GPT-5' }),
      createModelOption({ id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' })
    ])

    const filteredGroups = filterModelSelectorGroups(groups, '  CLAUDE  ')

    expect(filteredGroups).toHaveLength(1)
    expect(filteredGroups[0].options.map(option => option.model.id)).toEqual(['claude-sonnet-4-5'])
  })
})

describe('getChatToolbarModelSelectorTriggerClassName', () => {
  it('uses the graphite material tokens across surface and baseline variants', () => {
    const surface = getChatToolbarModelSelectorTriggerClassName('surface', true)
    const baseline = getChatToolbarModelSelectorTriggerClassName('baseline', false)
    const selectedBaseline = getChatToolbarModelSelectorTriggerClassName('baseline', true)

    expect(surface).toContain('min-w-[136px]')
    expect(surface).toContain('max-w-[220px]')
    expect(surface).toContain('rounded-[10px]')
    expect(surface).toContain('dark:bg-(--chat-surface)')
    expect(surface).toContain('dark:aria-expanded:bg-(--chat-surface-hover)')
    expect(baseline).toContain('min-w-[118px]')
    expect(baseline).toContain('max-w-[184px]')
    expect(baseline).toContain('rounded-xl')
    expect(baseline).toContain('dark:bg-(--app-surface)')
    expect(baseline).toContain('dark:hover:bg-(--app-surface-hover)')
    expect(selectedBaseline).toContain('dark:bg-(--app-surface-hover)')
  })
})

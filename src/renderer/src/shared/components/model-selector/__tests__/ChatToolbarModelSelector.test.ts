// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ModelOption } from '@renderer/shared/config/modelTypes'
import {
  filterModelSelectorGroups,
  groupModelSelectorOptions,
  resolveChatToolbarModelSelection
} from '../ChatToolbarModelSelector.utils'
import ChatToolbarModelSelector, { getChatToolbarModelSelectorTriggerClassName } from '../ChatToolbarModelSelector'

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

    expect(surface).toContain('min-w-[206px]')
    expect(surface).toContain('max-w-[280px]')
    expect(surface).toContain('rounded-[10px]')
    expect(surface).toContain('dark:bg-(--chat-surface)')
    expect(surface).toContain('dark:aria-expanded:bg-(--chat-surface-hover)')
    expect(baseline).toContain('min-w-[206px]')
    expect(baseline).toContain('max-w-[280px]')
    expect(baseline).toContain('rounded-xl')
    expect(baseline).toContain('dark:bg-(--app-surface)')
    expect(baseline).toContain('dark:hover:bg-(--app-surface-hover)')
    expect(selectedBaseline).toContain('dark:bg-(--app-surface-hover)')
  })
})


globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('thinking level menu interaction', () => {
  let root: Root | undefined
  let container: HTMLDivElement | undefined

  afterEach(async () => {
    await act(async () => root?.unmount())
    container?.remove()
  })

  const openSubMenu = async (selected: boolean, variant: 'default' | 'surface' | 'baseline' = 'default'): Promise<{ onModelSelect: ReturnType<typeof vi.fn>; onOpenChange: ReturnType<typeof vi.fn> }> => {
    const option = createModelOption({ capabilities: ['reasoning'] })
    const onModelSelect = vi.fn()
    const onOpenChange = vi.fn()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(createElement(ChatToolbarModelSelector, {
        variant,
        selectedModel: selected ? option : undefined,
        modelOptions: [option],
        plugins: [{ ...plugin, capabilities: [{
          kind: 'request-adapter',
          data: { providerType: 'openai', modelTypes: ['llm'], thinking: {
            levels: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
            defaultLevel: 'medium'
          } }
        }] }],
        selectedThinkingLevel: selected ? 'high' : undefined,
        isOpen: true,
        onOpenChange,
        onModelSelect
      }))
    })
    const trigger = document.body.querySelector<HTMLElement>('[role="menuitem"][aria-haspopup="menu"]')
    expect(trigger?.textContent).toBe('GPT-5')
    expect(trigger?.querySelector('[aria-label="Thinking"]')).not.toBeNull()
    expect(trigger?.querySelector('[title="GPT-5"]')).not.toBeNull()
    expect(Boolean(trigger?.querySelector('[aria-label="Selected"]'))).toBe(selected)
    await act(async () => trigger?.click())
    expect(onModelSelect).not.toHaveBeenCalled()
    return { onModelSelect, onOpenChange }
  }

  it.each(['surface', 'baseline'] as const)('shows the %s model and readable thinking level in a single trigger', async (variant) => {
    await openSubMenu(true, variant)
    const trigger = container?.querySelector('[role="combobox"]')
    expect(trigger?.textContent).toBe('GPT-5High')
    expect(container?.querySelectorAll('[role="combobox"]')).toHaveLength(1)
  })

  it('marks only the current model level as checked and selects another level', async () => {
    const { onModelSelect, onOpenChange } = await openSubMenu(true)
    const group = document.body.querySelector('[aria-label="Thinking level"]')
    const items = Array.from(group?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])
    expect(items.map(item => item.textContent)).toEqual(['None', 'Minimal', 'Low', 'Medium', 'High', 'Extra high'])
    expect(items.filter(item => item.getAttribute('aria-checked') === 'true').map(item => item.textContent)).toEqual(['High'])
    expect(group?.textContent).not.toContain('Default')
    expect(document.body.textContent).not.toContain('Thinking level')
    await act(async () => items[5].click())
    expect(onModelSelect).toHaveBeenCalledWith({ accountId: 'account-1', modelId: 'gpt-5' }, 'xhigh')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('returns to the model list on Escape without selecting or closing the parent menu', async () => {
    const { onModelSelect, onOpenChange } = await openSubMenu(false)
    const item = document.body.querySelector<HTMLElement>('[role="menuitemradio"]')
    await act(async () => {
      item?.focus()
      item?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    })
    expect(document.body.querySelector('[role="menuitemradio"]')).toBeNull()
    expect(document.activeElement?.getAttribute('aria-haspopup')).toBe('menu')
    expect(onModelSelect).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('labels the default without marking another model as selected and allows choosing it', async () => {
    const { onModelSelect, onOpenChange } = await openSubMenu(false)
    const items = Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitemradio"]'))
    expect(items.every(item => item.getAttribute('aria-checked') === 'false')).toBe(true)
    const defaultItem = items.find(item => item.textContent === 'MediumDefault')
    expect(defaultItem).toBeDefined()
    expect(defaultItem?.querySelector('.lucide-check')).toBeNull()
    await act(async () => defaultItem?.click())
    expect(onModelSelect).toHaveBeenCalledWith({ accountId: 'account-1', modelId: 'gpt-5' }, 'medium')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

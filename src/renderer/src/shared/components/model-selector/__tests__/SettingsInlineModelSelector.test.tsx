// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  isModelSelectorOptionSelected,
  settingsModelSelectorClassNames
} from '../BaseModelSelector'
import SettingsInlineModelSelector from '../SettingsInlineModelSelector'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const model: AccountModel = {
  id: 'model-current',
  label: 'Current vision model with a deliberately long name',
  type: 'mllm',
  enabled: true
}

const account: ProviderAccount = {
  id: 'account-1',
  providerId: 'provider-1',
  label: 'Work Account',
  apiUrl: 'https://example.test/v1',
  apiKey: 'test-key',
  models: [model]
}

const definition: ProviderDefinition = {
  id: 'provider-1',
  displayName: 'Example Provider',
  adapterPluginId: 'openai-chat-compatible-adapter',
  enabled: true
}

const selectedModel = { account, model, definition }

describe('SettingsInlineModelSelector', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('keeps the settings variant on semantic graphite surfaces', () => {
    expect(settingsModelSelectorClassNames.content).toContain('w-[min(380px,calc(100vw-2rem))]')
    expect(settingsModelSelectorClassNames.content).toContain('dark:bg-(--app-surface-raised)')
    expect(settingsModelSelectorClassNames.content).toContain('dark:backdrop-blur-none')
    expect(settingsModelSelectorClassNames.command).toContain('dark:[&_[cmdk-input-wrapper]]:bg-(--app-surface-inset)')
    expect(settingsModelSelectorClassNames.group).toContain('**:[[cmdk-group-heading]]:sticky')
    expect(settingsModelSelectorClassNames.item).toContain('dark:data-[selected=true]:bg-(--app-surface-hover)')
    expect(settingsModelSelectorClassNames.visionIcon).not.toContain('animate-')
  })

  it('matches the current option by both account and model', () => {
    expect(isModelSelectorOptionSelected(selectedModel, 'account-1', 'model-current')).toBe(true)
    expect(isModelSelectorOptionSelected(selectedModel, 'account-2', 'model-current')).toBe(false)
    expect(isModelSelectorOptionSelected(selectedModel, 'account-1', 'model-other')).toBe(false)
  })

  it('renders the open settings state and marks the current model', async () => {
    await act(async () => {
      root.render(
        <SettingsInlineModelSelector
          selectedModel={selectedModel}
          modelOptions={[selectedModel]}
          isOpen
          onOpenChange={vi.fn()}
          onModelSelect={vi.fn()}
          ariaLabel="Select main model"
        />
      )
    })

    const trigger = container.querySelector<HTMLButtonElement>('[role="combobox"]')
    const popover = document.body.querySelector<HTMLElement>('[data-model-selector-variant="settings"]')
    const currentItem = popover?.querySelector<HTMLElement>('[data-current="true"]')
    const visionIcon = currentItem?.querySelector<HTMLElement>('[aria-label="Vision capable"]')

    expect(trigger?.getAttribute('aria-expanded')).toBe('true')
    expect(trigger?.className).toContain('dark:aria-expanded:bg-(--app-surface-hover)')
    expect(popover?.className).toContain('dark:bg-(--app-surface-raised)')
    expect(currentItem?.textContent).toContain(model.label)
    expect(currentItem?.className).toContain('dark:bg-(--app-surface-hover)')
    expect(currentItem?.querySelector('.lucide-check')).not.toBeNull()
    expect(visionIcon?.className).not.toContain('animate-')
  })
})

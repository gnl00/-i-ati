// @vitest-environment happy-dom
import { act, type ReactNode, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ProviderModelsPanel } from '../ProviderModelsPanel'

const { updateModel } = vi.hoisted(() => ({ updateModel: vi.fn() }))
vi.mock('@renderer/infrastructure/config/appConfig', () => ({
  useAppConfigStore: Object.assign(() => ({ updateModel }), {
    getState: (): { getAccountById: () => undefined } => ({ getAccountById: (): undefined => undefined })
  })
}))
vi.mock('@renderer/infrastructure/ipc', () => ({
  invokeModelsGetModelCapabilities: (): Promise<{ models: object }> => Promise.resolve({ models: {} })
}))
vi.mock('@renderer/shared/components/ui/drawer', () => ({
  Drawer: ({ open, children }: { open: boolean; children: ReactNode }): ReactElement | null =>
    open ? <div>{children}</div> : null,
  DrawerContent: ({ children }: { children: ReactNode }): ReactElement => (
    <div>{children}</div>
  ),
  DrawerFooter: ({ children }: { children: ReactNode }): ReactElement => <div>{children}</div>
}))
vi.mock('@renderer/shared/components/ui/DrawerHeaderBar', () => ({
  default: (): ReactElement => <div>Edit model</div>
}))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let container: HTMLDivElement
let root: Root
const model = {
  id: 'model',
  label: 'Model',
  type: 'llm',
  enabled: true,
  modalities: ['text'],
  contextWindowTokens: 1_000_000
} as AccountModel
const account = {
  id: 'account',
  label: 'Account',
  models: [model]
} as ProviderAccount
const click = async (button: HTMLButtonElement): Promise<void> => {
  await act(async () => button.click())
}
const edit = async (): Promise<void> => {
  await click(container.querySelector('button[aria-label="Edit model Model"]')!)
}
const preset = (tokens: string): HTMLButtonElement =>
  container.querySelector(
    `button[aria-label="Set context window to ${tokens} tokens"]`
  )!
const input = (): HTMLInputElement =>
  container.querySelector('#editing-context-window')!
const action = (label: string): HTMLButtonElement =>
  [...container.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === label
  )!
const type = async (value: string): Promise<void> => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )!.set!.call(input(), value)
    input().dispatchEvent(new Event('input', { bubbles: true }))
  })
}
beforeEach(async () => {
  updateModel.mockClear()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <ProviderModelsPanel
        currentAccount={account}
        onModelTableCellClick={vi.fn()}
        onOpenFetchModels={vi.fn()}
        isFetchDisabled={false}
        ensureAccountForProvider={() => account}
      />
    )
  )
  await edit()
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})
it('selects exact decimal presets in the draft and saves only on confirmation', async () => {
  expect(preset('1,000,000').getAttribute('aria-pressed')).toBe('true')
  for (const tokens of ['128,000', '256,000', '1,000,000', '2,000,000']) {
    await click(preset(tokens))
    expect(input().value).toBe(tokens)
    expect(preset(tokens).getAttribute('aria-pressed')).toBe('true')
  }
  expect(updateModel).not.toHaveBeenCalled()
  await click(action('Save changes'))
  expect(updateModel).toHaveBeenCalledWith(
    'account',
    'model',
    expect.objectContaining({ contextWindowTokens: 2_000_000 })
  )
})
it('keeps custom values editable and synchronizes preset selection', async () => {
  await type('131072')
  expect(input().value).toBe('131,072')
  expect(container.querySelectorAll('[aria-pressed="true"]')).toHaveLength(0)
  await click(action('Save changes'))
  expect(updateModel).toHaveBeenCalledWith(
    'account',
    'model',
    expect.objectContaining({ contextWindowTokens: 131_072 })
  )
})
it('discards preset edits on cancel and preserves the existing unspecified-value behavior', async () => {
  await click(preset('128,000'))
  await click(action('Cancel'))
  expect(updateModel).not.toHaveBeenCalled()
  await edit()
  expect(input().value).toBe('1,000,000')
  await type('')
  await click(action('Save changes'))
  expect(updateModel).toHaveBeenCalledWith(
    'account',
    'model',
    expect.objectContaining({ contextWindowTokens: undefined })
  )
})

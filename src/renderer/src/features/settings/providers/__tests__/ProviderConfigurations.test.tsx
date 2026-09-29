// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ProviderConfigurations from '../ProviderConfigurations'

vi.mock('../ProviderAdvanceConfigDrawer', () => ({
  ProviderAdvanceConfigDrawer: (): null => null
}))
vi.mock('../ProviderIconConfigDrawer', () => ({
  ProviderIconConfigDrawer: (): null => null
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
import { toast } from 'sonner'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let container: HTMLDivElement
let root: Root
const definition = {
  id: 'provider',
  displayName: 'Provider'
} as ProviderDefinition
const account = {
  id: 'account',
  apiUrl: 'https://example.com',
  apiKey: 'test-key',
  models: [{ id: 'model', enabled: true }]
} as ProviderAccount
const onTestProvider = vi.fn()
const render = async (currentAccount = account): Promise<void> => {
  await act(async () => {
    root.render(
      <ProviderConfigurations
        providerDefinition={definition}
        account={currentAccount}
        onUpdateAccount={vi.fn()}
        onUpdateProviderDefinition={vi.fn()}
        onTestProvider={onTestProvider}
      />
    )
  })
}
const button = (): HTMLButtonElement =>
  container.querySelector<HTMLButtonElement>(
    'button[aria-label="Test provider connection"]'
  )!
const click = async (): Promise<void> => {
  await act(async () => {
    button().click()
  })
}
beforeEach(() => {
  vi.clearAllMocks()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})
it('shows success in place, clears it on retry, and keeps failure feedback', async () => {
  onTestProvider.mockResolvedValueOnce({ ok: true, modelId: 'model' })
  await render()
  await click()
  expect(button().querySelector('.lucide-check')).not.toBeNull()
  expect(button().querySelector('[role="status"]')?.textContent).toContain(
    'model'
  )
  expect(toast.success).not.toHaveBeenCalled()
  let resolve!: (result: {
    ok: boolean
    modelId: string
    error: string
  }) => void
  onTestProvider.mockReturnValueOnce(
    new Promise((result) => {
      resolve = result
    })
  )
  await click()
  expect(button().disabled).toBe(true)
  expect(button().textContent).toBe('Testing')
  expect(button().querySelector('.lucide-check')).toBeNull()
  await act(async () =>
    resolve({ ok: false, modelId: 'model', error: 'Connection failed' })
  )
  expect(toast.error).toHaveBeenCalledWith('Connection failed')
  expect(button().disabled).toBe(false)
})
it('invalidates success when configuration changes, including late responses', async () => {
  onTestProvider.mockResolvedValueOnce({ ok: true, modelId: 'model' })
  await render()
  await click()
  await render({ ...account, apiUrl: 'https://changed.example.com' })
  expect(button().querySelector('.lucide-check')).toBeNull()
  let resolve!: (result: { ok: boolean; modelId: string }) => void
  onTestProvider.mockReturnValueOnce(
    new Promise((result) => {
      resolve = result
    })
  )
  await render()
  await click()
  await render({ ...account, id: 'other-account' })
  await act(async () => resolve({ ok: true, modelId: 'model' }))
  expect(button().querySelector('.lucide-check')).toBeNull()
})
it('keeps exception feedback', async () => {
  onTestProvider.mockRejectedValueOnce(new Error('Request failed'))
  await render()
  await click()
  expect(toast.error).toHaveBeenCalledWith('Request failed')
  expect(button().querySelector('.lucide-check')).toBeNull()
})

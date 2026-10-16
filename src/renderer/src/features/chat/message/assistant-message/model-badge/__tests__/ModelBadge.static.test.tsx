// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { ModelBadge } from '../ModelBadge'

vi.mock('@renderer/shared/components/ProviderIcon', () => ({
  ProviderIcon: (): React.ReactElement => <span data-testid="provider-icon" />
}))

it('keeps the model badge static during active runs', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  try {
    await act(async () => root.render(<ModelBadge model="deepseek" provider="deepseek" animate />))
    expect(container.textContent).toContain('deepseek')
    expect(container.querySelector('[data-testid="provider-icon"]')).not.toBeNull()
    expect(container.querySelector('.model-badge-progress')).toBeNull()
    await act(async () => root.render(<ModelBadge model="deepseek" provider="deepseek" animate={false} />))
    expect(container.textContent).toContain('deepseek')
    expect(container.querySelector('.model-badge-progress')).toBeNull()
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})

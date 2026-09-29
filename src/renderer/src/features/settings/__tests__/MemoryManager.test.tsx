// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MEMORY_DELETE, MEMORY_GET_ALL } from '@shared/constants'
import MemoryManager from '../MemoryManager'
import { toast } from 'sonner'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const invoke = vi.fn()
let container: HTMLDivElement
let root: Root
const item = {
  id: 'one',
  role: 'user',
  context_origin: 'Prefer concise answers.',
  timestamp: 1700000000000
}
const render = async (): Promise<void> => {
  await act(async () =>
    root.render(<MemoryManager memoryEnabled setMemoryEnabled={vi.fn()} />)
  )
}
const click = async (label: string): Promise<void> => {
  const button = [...container.querySelectorAll('button')].find(
    (b) => b.textContent === label
  )!
  await act(async () => button.click())
}
beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'electron', {
    configurable: true,
    value: { ipcRenderer: { invoke } }
  })
  invoke.mockResolvedValue([item])
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})
it('loads memories and refreshes the count while preserving short content', async () => {
  await render()
  expect(invoke).toHaveBeenCalledWith(MEMORY_GET_ALL)
  expect(container.textContent).toContain(item.context_origin)
  expect(container.textContent).toContain('1 stored')
  expect(container.textContent).not.toContain('Show more')
  invoke.mockResolvedValueOnce([])
  await click('Refresh')
  expect(container.textContent).toContain('0 stored')
  expect(container.textContent).toContain('No memories stored')
})
it('expands truncated text and collapses it in place', async () => {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(100)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(36)
  await render()
  await click('Show more')
  const button = [...container.querySelectorAll('button')].find(
    (b) => b.textContent === 'Show less'
  )!
  expect(button.getAttribute('aria-expanded')).toBe('true')
  expect(
    document.getElementById(button.getAttribute('aria-controls')!)?.className
  ).not.toContain('line-clamp-2')
  await click('Show less')
  expect(container.textContent).toContain('Show more')
})
it('requires deletion confirmation and retains the entry on failure', async () => {
  await render()
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Delete memory"]')!
      .click()
  )
  expect(invoke).not.toHaveBeenCalledWith(MEMORY_DELETE, item.id)
  invoke.mockRejectedValueOnce(new Error('Delete unavailable'))
  await click('Yes')
  expect(container.textContent).toContain(item.context_origin)
  expect(toast.error).toHaveBeenCalledWith('Failed to delete memory')
  invoke.mockResolvedValueOnce(undefined)
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Delete memory"]')!
      .click()
  )
  await click('Yes')
  expect(invoke).toHaveBeenCalledWith(MEMORY_DELETE, item.id)
  expect(container.textContent).toContain('0 stored')
})

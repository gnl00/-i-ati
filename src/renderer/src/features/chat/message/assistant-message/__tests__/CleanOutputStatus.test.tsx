// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CleanOutputStatus } from '../renderers/CleanOutputStatus'

const motionPreference = vi.hoisted(() => ({ reduced: false }))
vi.mock('framer-motion', async importOriginal => ({
  ...await importOriginal<typeof import('framer-motion')>(),
  useReducedMotion: (): boolean => motionPreference.reduced
}))

describe('clean status updates', () => {
  let root: Root
  let container: HTMLDivElement
  beforeEach(() => {
    motionPreference.reduced = false
    vi.useFakeTimers()
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.useRealTimers()
  })
  const render = async (label: string): Promise<void> => {
    await act(async () => root.render(<CleanOutputStatus label={label} />))
  }
  it('coalesces rapid updates to the latest status and immediately exposes waiting/stopping', async () => {
    await render('Thinking…')
    const status = container.querySelector('[role="status"]')!
    await render('Preparing read_file…')
    await render('Running read_file…')
    expect(status.getAttribute('aria-label')).toBe('Thinking…')
    await act(async () => vi.advanceTimersByTime(150))
    expect(status.getAttribute('aria-label')).toBe('Running read_file…')
    await render('Waiting for approval')
    expect(status.getAttribute('aria-label')).toBe('Waiting for approval')
    await render('Stopping…')
    expect(status.getAttribute('aria-label')).toBe('Stopping…')
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1)
  })
  it('replaces status immediately with reduced motion', async () => {
    motionPreference.reduced = true
    await render('Thinking…')
    await render('Writing response…')
    expect(container.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe('Writing response…')
  })
})

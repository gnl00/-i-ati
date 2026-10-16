// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CleanOutputProgress } from '../model/cleanOutput'
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
  const render = async (label: string, phase: CleanOutputProgress['phase'] = 'working'): Promise<void> => {
    await act(async () => root.render(<CleanOutputStatus progress={{ label, phase }} />))
  }
  it('coalesces rapid updates to the latest status and immediately exposes waiting/stopping', async () => {
    await render('Thinking…', 'thinking')
    const status = container.querySelector('[role="status"]')!
    expect(status.querySelector('[data-phase="thinking"]')).not.toBeNull()
    await render('Preparing read_file…', 'tool')
    await render('Running read_file…', 'tool')
    expect(status.getAttribute('aria-label')).toBe('Thinking…')
    await act(async () => vi.advanceTimersByTime(150))
    expect(status.getAttribute('aria-label')).toBe('Running read_file…')
    await render('Waiting for approval', 'approval')
    expect(status.getAttribute('aria-label')).toBe('Waiting for approval')
    await render('Stopping…', 'cancelling')
    expect(status.getAttribute('aria-label')).toBe('Stopping…')
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1)
    expect(status.querySelector('[data-phase="cancelling"] svg')).not.toBeNull()
    expect(status.querySelector('.animate-spin')).toBeNull()
    expect(status.querySelector('.will-change-transform')).toBeNull()
  })
  it.each(['working', 'thinking', 'tool', 'writing', 'approval', 'question', 'cancelling'] as const)('uses a refresh animation only for busy %s states', async phase => {
    await render('Arbitrary reason', phase)
    expect(container.querySelector(`[data-phase="${phase}"] svg`)).not.toBeNull()
    expect(container.querySelector('.motion-safe\\:animate-spin') !== null).toBe(['working', 'thinking', 'tool', 'writing'].includes(phase))
  })

  it('updates phase and label together without interpreting reason text', async () => {
    await render('Thinking…', 'thinking')
    await render('Waiting for approval wording in a document Running 2 tools.', 'tool')
    expect(container.querySelector('[data-phase="thinking"]')).not.toBeNull()
    expect(container.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe('Thinking…')
    await act(async () => vi.advanceTimersByTime(150))
    expect(container.querySelector('[data-phase="tool"]')).not.toBeNull()
    expect(container.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe('Waiting for approval wording in a document Running 2 tools.')
  })

  it('keeps the shimmer node and text overlay synchronized across label changes', async () => {
    await render('First reason Running 2 tools.', 'tool')
    const label = container.querySelector('.clean-status-label')!
    expect(label.getAttribute('data-shimmer')).toBe('true')
    await render('Second reason Running 2 tools.', 'tool')
    await act(async () => vi.advanceTimersByTime(150))
    expect(container.querySelector('.clean-status-label')).toBe(label)
    expect(label.textContent).toBe('Second reason Running 2 tools.')
    expect(label.getAttribute('data-text')).toBe(label.textContent)
    await render('Waiting for approval', 'approval')
    expect(label.getAttribute('data-shimmer')).toBe('false')
    expect(label.getAttribute('data-text')).toBe('Waiting for approval')
  })

  it('replaces status immediately with reduced motion', async () => {
    motionPreference.reduced = true
    await render('Thinking…', 'thinking')
    await render('Writing response…', 'writing')
    expect(container.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe('Writing response…')
    expect(container.querySelector('[class*="animate-"]')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })
})

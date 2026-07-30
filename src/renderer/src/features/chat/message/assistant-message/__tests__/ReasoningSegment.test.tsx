// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReasoningSegment } from '../segments/ReasoningSegment'

const BASE_TIME = new Date('2026-06-26T00:00:00.000Z')
const createSegment = (overrides: Partial<ReasoningSegment> = {}): ReasoningSegment => ({
  type: 'reasoning',
  segmentId: 'reasoning-1',
  content: 'Inspect current code\n\n- preserve details',
  timestamp: BASE_TIME.getTime(),
  ...overrides
})

describe('ReasoningSegment', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(BASE_TIME)
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  it('renders a collapsed inline Think disclosure for history', async () => {
    await act(async () => root.render(<ReasoningSegment segment={createSegment()} />))
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Toggle think"]')
    const panel = container.querySelector('[data-testid="reasoning-inline-panel"]')
    const segment = container.querySelector('[data-testid="reasoning-segment"]')
    const label = container.querySelector('[data-testid="reasoning-label"]')
    const hairline = container.querySelector('[data-testid="reasoning-hairline"]')
    const chevron = container.querySelector('[data-testid="reasoning-chevron"]')

    expect(trigger?.textContent).toContain('Think')
    expect(trigger?.getAttribute('aria-expanded')).toBe('false')
    expect(panel?.getAttribute('data-state')).toBe('collapsed')
    expect(segment?.classList.contains('px-2')).toBe(true)
    expect(segment?.classList.contains('my-1.5')).toBe(true)
    expect(trigger?.classList.contains('bg-transparent')).toBe(true)
    expect(label?.classList.contains('font-medium')).toBe(true)
    expect(label?.classList.contains('text-slate-400')).toBe(true)
    expect(hairline?.classList.contains('bg-slate-200/55')).toBe(true)
    expect(chevron?.classList.contains('text-slate-300')).toBe(true)
    expect(container.querySelector('button[aria-label="Copy think"]')).toBeNull()

    await act(async () => trigger?.click())
    expect(trigger?.getAttribute('aria-expanded')).toBe('true')
    expect(panel?.getAttribute('data-state')).toBe('expanded')
    expect(label?.classList.contains('text-slate-500')).toBe(true)
    expect(container.textContent).toContain('preserve details')
  })

  it('opens while streaming and preserves a user collapse after streaming settles', async () => {
    const segment = createSegment({ timestamp: Date.now() })
    await act(async () => root.render(<ReasoningSegment segment={segment} isStreaming />))
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Toggle think"]')
    expect(trigger?.getAttribute('aria-expanded')).toBe('true')

    await act(async () => trigger?.click())
    await act(async () => root.render(<ReasoningSegment segment={segment} isStreaming={false} />))
    expect(trigger?.getAttribute('aria-expanded')).toBe('false')
  })

  it('updates duration while streaming', async () => {
    const segment = createSegment({ timestamp: Date.now(), content: 'Original\n```ts\nconst x = 1' })
    await act(async () => root.render(<ReasoningSegment segment={segment} isStreaming />))
    expect(container.querySelector('[data-testid="reasoning-duration"]')?.textContent).toBe('1s')
    await act(async () => vi.advanceTimersByTime(1250))
    expect(container.querySelector('[data-testid="reasoning-duration"]')?.textContent).toBe('2s')
  })
})

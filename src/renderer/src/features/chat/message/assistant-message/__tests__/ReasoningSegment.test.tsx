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
    const header = container.querySelector('[data-testid="support-segment-header"]')
    const icon = container.querySelector('[data-testid="reasoning-icon"]')
    const label = container.querySelector('[data-testid="reasoning-label"]')
    const description = container.querySelector('[data-testid="reasoning-description"]')
    const chevron = container.querySelector('[data-testid="reasoning-chevron"]')

    expect(trigger?.textContent).toContain('Think')
    expect(trigger?.getAttribute('aria-expanded')).toBe('false')
    expect(panel?.getAttribute('data-state')).toBe('collapsed')
    expect(segment?.classList.contains('px-2')).toBe(true)
    expect(segment?.classList.contains('my-1.5')).toBe(true)
    expect(segment?.classList.contains('w-[90%]')).toBe(true)
    expect(segment?.classList.contains('max-w-full')).toBe(true)
    expect(trigger?.classList.contains('bg-transparent')).toBe(true)
    expect(trigger?.classList.contains('border-b')).toBe(true)
    expect(trigger?.classList.contains('border-slate-200/30')).toBe(true)
    expect(trigger?.classList.contains('rounded-lg')).toBe(false)
    expect(trigger?.classList.contains('shadow-none')).toBe(true)
    expect(trigger?.classList.contains('px-2')).toBe(false)
    expect(trigger?.classList.contains('hover:border-slate-200/50')).toBe(true)
    expect(trigger?.classList.contains('hover:bg-slate-50/55')).toBe(true)
    expect(trigger?.classList.contains('duration-150')).toBe(true)
    expect(header?.classList.contains('grid-cols-[auto_minmax(0,1fr)_auto_auto]')).toBe(true)
    expect(icon?.querySelector('svg')?.classList.contains('lucide-lightbulb')).toBe(true)
    expect(icon?.classList.contains('h-5')).toBe(true)
    expect(icon?.classList.contains('rounded-md')).toBe(true)
    expect(icon?.classList.contains('border-slate-200/60')).toBe(true)
    expect(icon?.classList.contains('bg-slate-100/65')).toBe(true)
    expect(icon?.querySelector('svg')?.classList.contains('text-slate-500')).toBe(true)
    expect(label?.classList.contains('font-semibold')).toBe(true)
    expect(label?.classList.contains('uppercase')).toBe(true)
    expect(description).toBeNull()
    expect(chevron?.classList.contains('col-start-4')).toBe(true)
    expect(container.querySelector('[data-testid="reasoning-hairline"]')).toBeNull()
    const chevronIcon = chevron?.querySelector('svg')
    expect(chevronIcon?.classList.contains('h-3.5')).toBe(true)
    expect(chevronIcon?.classList.contains('w-3.5')).toBe(true)
    expect(chevronIcon?.classList.contains('transition-transform')).toBe(true)
    expect(chevronIcon?.classList.contains('opacity-[0.45]')).toBe(false)
    expect(chevronIcon?.classList.contains('motion-reduce:transition-none')).toBe(true)
    expect(container.querySelector('button[aria-label="Copy think"]')).toBeNull()

    await act(async () => trigger?.click())
    expect(trigger?.getAttribute('aria-expanded')).toBe('true')
    expect(panel?.getAttribute('data-state')).toBe('expanded')
    expect(trigger?.classList.contains('border-slate-200/50')).toBe(true)
    expect(trigger?.classList.contains('bg-slate-50/45')).toBe(true)
    expect(icon?.classList.contains('scale-[1.03]')).toBe(true)
    expect(container.textContent).toContain('preserve details')
  })

  it('opens while streaming and preserves a user collapse after streaming settles', async () => {
    const segment = createSegment({ timestamp: Date.now() })
    await act(async () => root.render(<ReasoningSegment segment={segment} isStreaming />))
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Toggle think"]')
    expect(trigger?.getAttribute('aria-expanded')).toBe('true')
    expect(container.querySelector('[data-testid="reasoning-description"]')?.textContent)
      .toBe('Reasoning in progress')

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

  it('places the duration immediately before the disclosure chevron', async () => {
    const segment = createSegment({ endedAt: BASE_TIME.getTime() + 1250 })
    await act(async () => root.render(<ReasoningSegment segment={segment} />))

    const header = container.querySelector('[data-testid="support-segment-header"]')
    const childTestIds = Array.from(header?.children ?? []).map(
      child => child.getAttribute('data-testid')
    )

    expect(childTestIds).toEqual([
      'reasoning-icon',
      null,
      'reasoning-duration',
      'reasoning-chevron'
    ])
    expect(header?.querySelector('[data-testid="reasoning-label"]')?.textContent).toBe('Think')
    expect(header?.querySelector('[data-testid="reasoning-description"]')).toBeNull()
    expect(header?.querySelector('[data-testid="reasoning-duration"]')?.classList.contains('col-start-3'))
      .toBe(true)
    expect(header?.querySelector('[data-testid="reasoning-duration"]')
      ?.classList.contains('opacity-[0.45]')).toBe(false)
    expect(header?.querySelector('[data-testid="reasoning-chevron"]')?.classList.contains('col-start-4'))
      .toBe(true)
  })

  it('uses the full available width inside a completed-work disclosure', async () => {
    await act(async () => root.render(
      <ReasoningSegment
        segment={createSegment({ endedAt: BASE_TIME.getTime() + 1250 })}
        fullWidth
        nestedDisclosure
      />
    ))

    const segment = container.querySelector('[data-testid="reasoning-segment"]')
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Toggle think"]')
    const duration = container.querySelector('[data-testid="reasoning-duration"]')
    const chevron = container.querySelector('[data-testid="reasoning-chevron"] svg')
    expect(segment?.classList.contains('w-full')).toBe(true)
    expect(segment?.classList.contains('w-[90%]')).toBe(false)
    expect(chevron?.classList.contains('h-3')).toBe(true)
    expect(chevron?.classList.contains('w-3')).toBe(true)
    expect(chevron?.classList.contains('h-3.5')).toBe(false)
    expect(chevron?.classList.contains('transition-[transform,opacity]')).toBe(true)
    expect(chevron?.classList.contains('opacity-[0.45]')).toBe(true)
    expect(chevron?.classList.contains('group-hover/support:opacity-80')).toBe(true)
    expect(chevron?.classList.contains('group-focus-visible/support:opacity-80')).toBe(true)
    expect(chevron?.classList.contains('motion-reduce:transition-none')).toBe(true)
    expect(duration?.classList.contains('transition-opacity')).toBe(true)
    expect(duration?.classList.contains('opacity-[0.45]')).toBe(true)
    expect(duration?.classList.contains('group-hover/support:opacity-80')).toBe(true)
    expect(duration?.classList.contains('group-focus-visible/support:opacity-80')).toBe(true)
    expect(duration?.classList.contains('motion-reduce:transition-none')).toBe(true)

    await act(async () => trigger?.click())
    expect(trigger?.getAttribute('aria-expanded')).toBe('true')
    expect(chevron?.classList.contains('rotate-180')).toBe(true)
    expect(chevron?.classList.contains('opacity-80')).toBe(true)
    expect(chevron?.classList.contains('opacity-[0.45]')).toBe(false)
    expect(duration?.classList.contains('opacity-80')).toBe(true)
    expect(duration?.classList.contains('opacity-[0.45]')).toBe(false)
  })
})

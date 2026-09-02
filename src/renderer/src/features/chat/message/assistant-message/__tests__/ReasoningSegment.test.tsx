// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReasoningSegment } from '../segments/ReasoningSegment'

const motionTestState = vi.hoisted(() => ({ reducedMotion: false }))

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>()
  return {
    ...actual,
    useReducedMotion: () => motionTestState.reducedMotion
  }
})

vi.mock('@renderer/features/chat/message/typewriter/StreamingMarkdownLite', () => ({
  StreamingMarkdownLite: ({
    text,
    className,
    animate
  }: {
    text: string
    className?: string
    animate?: boolean
  }) => (
    <div
      data-testid="reasoning-streaming-markdown"
      data-mode="lite"
      data-animate={String(animate)}
      className={className}
    >
      {animate ? <span data-testid="fluid-typewriter-tail" /> : null}
      {text}
    </div>
  )
}))

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
  let animationFrames: Map<number, FrameRequestCallback>
  let nextAnimationFrameId: number

  const runNextFrame = async (timestamp: number): Promise<void> => {
    const nextFrame = animationFrames.entries().next().value as [number, FrameRequestCallback] | undefined
    expect(nextFrame).toBeDefined()
    const [id, callback] = nextFrame as [number, FrameRequestCallback]
    animationFrames.delete(id)
    await act(async () => {
      callback(timestamp)
    })
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(BASE_TIME)
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    animationFrames = new Map()
    nextAnimationFrameId = 0
    motionTestState.reducedMotion = false
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      const id = ++nextAnimationFrameId
      animationFrames.set(id, callback)
      return id
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => {
      animationFrames.delete(id)
    }))
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
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
    expect(panel?.hasAttribute('inert')).toBe(true)
    expect(segment?.classList.contains('px-2')).toBe(false)
    expect(segment?.classList.contains('my-1.5')).toBe(true)
    expect(segment?.classList.contains('w-[90%]')).toBe(true)
    expect(segment?.classList.contains('max-w-full')).toBe(true)
    expect(trigger?.classList.contains('bg-white/30')).toBe(true)
    expect(trigger?.classList.contains('border')).toBe(true)
    expect(trigger?.classList.contains('border-b')).toBe(false)
    expect(trigger?.classList.contains('border-slate-200/35')).toBe(true)
    expect(trigger?.classList.contains('rounded-[10px]')).toBe(true)
    expect(trigger?.classList.contains('overflow-hidden')).toBe(true)
    expect(trigger?.classList.contains('shadow-none')).toBe(true)
    expect(trigger?.classList.contains('px-2')).toBe(true)
    expect(trigger?.classList.contains('hover:border-slate-200/60')).toBe(true)
    expect(trigger?.classList.contains('hover:bg-slate-50/70')).toBe(true)
    expect(trigger?.classList.contains('dark:bg-(--chat-surface)')).toBe(true)
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
    expect(panel?.hasAttribute('inert')).toBe(false)
    expect(trigger?.classList.contains('border-slate-200/60')).toBe(true)
    expect(trigger?.classList.contains('bg-slate-50/65')).toBe(true)
    expect(trigger?.classList.contains('dark:bg-(--chat-surface-raised)')).toBe(true)
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

  it('uses quiet lite Markdown for partial streaming content and full Markdown after completion', async () => {
    const segment = createSegment({ content: '甲乙丙' })
    await act(async () => root.render(<ReasoningSegment segment={segment} isStreaming />))

    await runNextFrame(0)
    const streamingRenderer = container.querySelector('[data-testid="reasoning-streaming-markdown"]')
    expect(streamingRenderer?.getAttribute('data-mode')).toBe('lite')
    expect(streamingRenderer?.getAttribute('data-animate')).toBe('false')
    expect(streamingRenderer?.querySelector('[data-testid="fluid-typewriter-tail"]')).toBeNull()
    expect(streamingRenderer?.textContent).toBe('甲')

    await act(async () => root.render(<ReasoningSegment segment={segment} isStreaming={false} />))
    expect(container.querySelector('[data-testid="reasoning-streaming-markdown"]')).toBeNull()
    expect(container.querySelector('[data-testid="reasoning-think-content"]')?.textContent).toContain('甲乙丙')
  })

  it('synchronizes a collapsed Think and plays only later appended content after reopen', async () => {
    const segment = createSegment({ content: '甲乙' })
    await act(async () => root.render(<ReasoningSegment segment={segment} isStreaming />))
    await runNextFrame(0)
    expect(container.querySelector('[data-testid="reasoning-streaming-markdown"]')?.textContent).toBe('甲')

    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Toggle think"]')
    await act(async () => trigger?.click())
    const synchronizedSegment = { ...segment, content: '甲乙丙' }
    await act(async () => root.render(<ReasoningSegment segment={synchronizedSegment} isStreaming />))
    expect(container.querySelector('[data-testid="reasoning-streaming-markdown"]')?.textContent).toBe('甲乙丙')

    await act(async () => trigger?.click())
    const appendedSegment = { ...synchronizedSegment, content: '甲乙丙丁戊己' }
    await act(async () => root.render(<ReasoningSegment segment={appendedSegment} isStreaming />))
    await runNextFrame(0)
    await runNextFrame(32)
    expect(container.querySelector('[data-testid="reasoning-streaming-markdown"]')?.textContent).toBe('甲乙丙丁戊')
  })

  it('uses full Markdown and immediate content for reduced motion', async () => {
    motionTestState.reducedMotion = true
    const segment = createSegment({ content: '甲乙丙' })

    await act(async () => root.render(<ReasoningSegment segment={segment} isStreaming />))
    expect(container.querySelector('[data-testid="reasoning-streaming-markdown"]')).toBeNull()
    expect(container.querySelector('[data-testid="reasoning-think-content"]')?.textContent).toContain('甲乙丙')
    expect(animationFrames).toHaveLength(0)
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

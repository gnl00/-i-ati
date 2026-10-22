// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CleanOutputProgress } from '../model/cleanOutput'
import { CleanOutputStatus } from '../renderers/CleanOutputStatus'

const motionPreference = vi.hoisted(() => ({ reduced: false }))
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>()
  const React = await import('react')
  const MotionSpan = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement> & { initial?: unknown; animate?: unknown; exit?: unknown; transition?: unknown }>(({ initial, animate, exit, transition, ...props }, ref) => <span {...props} ref={ref} data-animate={JSON.stringify(animate)} data-exit={JSON.stringify(exit)} data-entry={JSON.stringify(initial)} data-transition={JSON.stringify(transition)} />)
  MotionSpan.displayName = 'MotionSpan'
  return {
    ...actual,
    AnimatePresence: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
    motion: new Proxy(actual.motion, { get: (target, property): unknown => property === 'span' ? MotionSpan : Reflect.get(target, property) }),
    useReducedMotion: (): boolean => motionPreference.reduced
  }
})

describe('clean status updates', () => {
  let root: Root
  let container: HTMLDivElement
  beforeEach(() => {
    motionPreference.reduced = false
    vi.useFakeTimers()
    ;(
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.useRealTimers()
  })
  const render = async (
    label: string,
    phase: CleanOutputProgress['phase'] = 'working'
  ): Promise<void> => {
    await act(async () =>
      root.render(<CleanOutputStatus progress={{ label, phase }} />)
    )
  }
  it('coalesces rapid updates to the latest status and immediately exposes waiting/stopping', async () => {
    await render('Thinking…', 'thinking')
    const status = container.querySelector('[role="status"]')!
    expect(container.querySelector('[data-phase="thinking"]')).not.toBeNull()
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
    expect(
      container.querySelector('[data-phase="cancelling"] svg')
    ).not.toBeNull()
    expect(container.querySelector('.animate-spin')).toBeNull()
    expect(container.querySelector('.will-change-transform')).toBeNull()
  })
  it.each([
    'working',
    'thinking',
    'tool',
    'writing',
    'approval',
    'question',
    'cancelling'
  ] as const)(
    'uses a refresh animation only for busy %s states',
    async (phase) => {
      await render('Arbitrary reason', phase)
      expect(
        container.querySelector(`[data-phase="${phase}"] svg`)
      ).not.toBeNull()
      expect(
        container.querySelector('.motion-safe\\:animate-spin') !== null
      ).toBe(['working', 'thinking', 'tool', 'writing'].includes(phase))
    }
  )

  it('updates phase and label together without interpreting reason text', async () => {
    await render('Thinking…', 'thinking')
    await render(
      'Waiting for approval wording in a document Running 2 tools.',
      'tool'
    )
    expect(container.querySelector('[data-phase="thinking"]')).not.toBeNull()
    expect(
      container.querySelector('[role="status"]')?.getAttribute('aria-label')
    ).toBe('Thinking…')
    await act(async () => vi.advanceTimersByTime(150))
    expect(container.querySelector('[data-phase="tool"]')).not.toBeNull()
    expect(
      container.querySelector('[role="status"]')?.getAttribute('aria-label')
    ).toBe('Waiting for approval wording in a document Running 2 tools.')
  })

  it('replaces only summary text for entry motion and keeps unchanged labels mounted', async () => {
    await render('First reason Running 2 tools.', 'tool')
    const label = container.querySelector('.clean-status-label')!
    expect(label.getAttribute('data-shimmer')).toBe('true')
    await render('Second reason Running 2 tools.', 'tool')
    await act(async () => vi.advanceTimersByTime(150))
    const nextLabel = container.querySelector('.clean-status-label')!
    expect(nextLabel).not.toBe(label)
    expect(nextLabel.textContent).toBe('Second reason Running 2 tools.')
    expect(nextLabel.getAttribute('data-text')).toBe(nextLabel.textContent)
    await render('Second reason Running 2 tools.', 'tool')
    await act(async () => vi.advanceTimersByTime(150))
    expect(container.querySelector('.clean-status-label')).toBe(nextLabel)
    await render('Waiting for approval', 'approval')
    expect(container.querySelector('.clean-status-label')?.getAttribute('data-shimmer')).toBe('false')
    expect(container.querySelector('.clean-status-label')?.getAttribute('data-text')).toBe('Waiting for approval')
  })

  it('follows only current detail while preserving the user expansion choice', async () => {
    motionPreference.reduced = true
    const update = async (progress: CleanOutputProgress): Promise<void> => {
      await act(async () =>
        root.render(<CleanOutputStatus progress={progress} />)
      )
    }
    await update({
      phase: 'thinking',
      label: 'Inspect source.',
      detail: { kind: 'thinking', segmentId: 'current-thought', content: 'Current thought only.' }
    })
    const button = container.querySelector('button')!
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(container.textContent).not.toContain('Current thought only.')
    await act(async () => button.click())
    expect(container.textContent).toContain('Current thought only.')
    expect(button.getAttribute('aria-expanded')).toBe('true')
    await update({
      phase: 'thinking',
      label: 'Next thought.',
      detail: { kind: 'thinking', segmentId: 'current-thought', content: 'Next current thought.' }
    })
    expect(container.textContent).not.toContain('Current thought only.')
    expect(container.textContent).toContain('Next current thought.')
    await update({ phase: 'working', label: 'Working…' })
    expect(container.querySelector('button')).toBeNull()
    expect(container.textContent).not.toContain('Next current thought.')
    await update({
      phase: 'thinking',
      label: 'Resumed.',
      detail: { kind: 'thinking', segmentId: 'current-thought', content: 'Resumed content.' }
    })
    expect(
      container.querySelector('button')?.getAttribute('aria-expanded')
    ).toBe('true')
    expect(container.textContent).toContain('Resumed content.')
  })

  it('switches an open tool detail to writing without retaining old content', async () => {
    motionPreference.reduced = true
    const segment: ToolCallSegment = {
      type: 'toolCall',
      segmentId: 'active-tool',
      toolCallId: 'active-tool',
      name: 'read_file',
      timestamp: 1,
      content: { status: 'running', args: { path: 'current.ts' } }
    }
    const item = {
      key: 'active-tool',
      layer: 'committed' as const,
      order: 0,
      sourceIndex: 0,
      segment,
      isStreamingTail: true
    }
    await act(async () =>
      root.render(
        <CleanOutputStatus
          progress={{
            phase: 'tool',
            label: 'Read current file.',
            detail: { kind: 'tool', items: [item] }
          }}
        />
      )
    )
    await act(async () => container.querySelector('button')!.click())
    expect(container.textContent).toContain('read_file')
    const toolRow = container.querySelector('[data-testid="support-segment-row-active-tool"]')!
    expect(toolRow).not.toBeNull()
    expect(toolRow.getAttribute('aria-expanded')).toBe('false')
    await act(async () => (toolRow as HTMLButtonElement).click())
    expect(toolRow.getAttribute('aria-expanded')).toBe('true')
    expect(container.textContent).toContain('current.ts')

    await act(async () =>
      root.render(
        <CleanOutputStatus
          progress={{
            phase: 'writing',
            label: 'Writing response…',
            detail: {
              kind: 'writing',
              segment: {
                type: 'text',
                segmentId: 'answer',
                content: 'Current answer content.',
                timestamp: 2
              }
            }
          }}
        />
      )
    )
    expect(container.textContent).toContain('Current answer content.')
    expect(container.textContent).not.toContain('read_file')
    expect(container.textContent).not.toContain('Response in progress')
  })

  it.each(['thinking', 'writing'] as const)('types expanded %s content and continues appended text', async kind => {
    const frames = new Map<number, FrameRequestCallback>()
    let nextId = 0
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++nextId, callback)
      return nextId
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
    const update = async (content: string): Promise<void> => {
      const detail: CleanOutputProgress['detail'] = kind === 'thinking'
        ? { kind, segmentId: 'typed', content }
        : { kind, segment: { type: 'text', segmentId: 'typed', content, timestamp: 1 } }
      await act(async () => root.render(<CleanOutputStatus progress={{ phase: kind, label: 'Current status', detail }} />))
      await act(async () => vi.advanceTimersByTime(150))
    }
    const frame = async (time: number): Promise<void> => {
      const pending = [...frames.values()]
      frames.clear()
      await act(async () => pending.forEach(callback => callback(time)))
    }
    try {
      await update('甲乙丙')
      await act(async () => container.querySelector('button')!.click())
      expect(container.textContent).not.toContain('甲乙丙')
      await frame(0)
      expect(container.textContent).toContain('甲')
      expect(container.textContent).not.toContain('甲乙丙')
      await frame(32)
      await frame(64)
      expect(container.textContent).toContain('甲乙丙')
      await update('甲乙丙丁戊')
      expect(container.textContent).not.toContain('甲乙丙丁戊')
      await frame(96)
      await frame(128)
      expect(container.textContent).toContain('甲乙丙丁戊')
      await act(async () => container.querySelector('button')!.click())
      expect(frames.size).toBe(0)
      expect(container.textContent).not.toContain('甲乙丙')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('keeps metadata static and advances elapsed time without resetting across task phase changes', async () => {
    motionPreference.reduced = true
    vi.setSystemTime(10_000)
    const update = async (label: string, endedAt?: number, phase: CleanOutputProgress['phase'] = 'tool'): Promise<void> => {
      await act(async () => root.render(<CleanOutputStatus progress={{ phase, label, toolCount: 2 }} startedAt={7000} endedAt={endedAt} />))
    }
    await update('Inspect source')
    expect(container.querySelector('[data-testid="work-tool-count"]')?.textContent).toBe('2 Tools')
    expect(container.querySelector('[data-testid="work-duration"]')?.textContent).toBe('3s')
    expect(container.querySelector('.clean-status-label')?.textContent).toBe('Inspect source')
    const duration = container.querySelector('[data-testid="work-duration"]')!
    const summary = container.querySelector('.clean-status-label')!
    const count = container.querySelector('[data-testid="work-tool-count"]')!
    expect(duration.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(summary.compareDocumentPosition(count) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await act(async () => vi.advanceTimersByTime(2000))
    await update('Writing response…', undefined, 'writing')
    expect(container.querySelector('[data-testid="work-duration"]')?.textContent).toBe('5s')
    await update('Finished stage', 11_000)
    await act(async () => vi.advanceTimersByTime(3000))
    expect(container.querySelector('[data-testid="work-duration"]')?.textContent).toBe('4s')
  })

  it('replaces status immediately with reduced motion', async () => {
    motionPreference.reduced = true
    await render('Thinking…', 'thinking')
    await render('Writing response…', 'writing')
    expect(
      container.querySelector('[role="status"]')?.getAttribute('aria-label')
    ).toBe('Writing response…')
    expect(container.querySelector('[class*="animate-"]')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })
})

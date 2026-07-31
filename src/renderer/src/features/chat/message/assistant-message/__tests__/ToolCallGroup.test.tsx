// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupportSegmentRenderItem } from '../model/assistantMessageMapper'
import { ToolCallGroup } from '../toolcall/ToolCallGroup'
import { useChatStore } from '@renderer/features/chat/state/chatStore'

vi.mock('framer-motion', async () => {
  const React = await import('react')
  const MotionDiv = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & {
    animate?: unknown
    initial?: unknown
    transition?: unknown
  }>(({
    animate,
    children,
    initial,
    transition,
    ...props
  }, ref) => (
    <div
      {...props}
      ref={ref}
      data-motion-animate={animate === undefined ? undefined : JSON.stringify(animate)}
      data-motion-initial={initial === undefined ? undefined : JSON.stringify(initial)}
      data-motion-transition={transition === undefined ? undefined : JSON.stringify(transition)}
    >
      {children}
    </div>
  ))
  MotionDiv.displayName = 'MotionDiv'

  return {
    motion: { div: MotionDiv },
    useReducedMotion: () => false
  }
})

const toolCallItem = (
  id: string,
  order: number,
  status = 'completed'
): SupportSegmentRenderItem => ({
  key: id,
  layer: 'committed',
  sourceIndex: order,
  order,
  isStreamingTail: false,
  segment: {
    type: 'toolCall',
    segmentId: `segment-${id}`,
    name: `tool_${id}`,
    content: {
      toolName: `tool_${id}`,
      args: { input: id, tool_call_reason: `Reason ${id}` },
      status,
      result: { ok: true }
    },
    timestamp: 1,
    toolCallId: id,
    toolCallIndex: order,
    cost: 20
  }
})

describe('ToolCallGroup', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    useChatStore.setState({
      currentChatUuid: 'chat-1',
      artifactsPanelOpen: false,
      artifactsActiveTab: 'stats',
      toolCallInspectorSelection: null,
      toolLiveOutputs: {}
    })
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it('renders rows in one framed list and lazily expands one inline detail at a time', async () => {
    await act(async () => {
      root.render(<ToolCallGroup items={[toolCallItem('1', 0), toolCallItem('2', 1)]} />)
    })

    expect(container.querySelectorAll('[data-testid^="tool-call-group-row-"]')).toHaveLength(2)
    expect(container.querySelectorAll('[data-testid="tool-call-inspector-details"]')).toHaveLength(0)
    const group = container.querySelector('[data-testid="tool-call-group"]')
    expect(group?.classList.contains('rounded-lg')).toBe(true)
    expect(group?.classList.contains('border-slate-200/28')).toBe(true)
    expect(group?.classList.contains('bg-white/30')).toBe(true)
    expect(group?.classList.contains('w-[90%]')).toBe(true)
    expect(group?.classList.contains('max-w-full')).toBe(true)
    expect(group?.classList.contains('shadow-xs')).toBe(false)

    const first = container.querySelector<HTMLButtonElement>('[data-testid="support-segment-row-segment-1"]')
    const second = container.querySelector<HTMLButtonElement>('[data-testid="support-segment-row-segment-2"]')
    const firstHeader = first?.querySelector('[data-testid="tool-call-trigger-content-segment-1"]')
    const firstStatus = first?.querySelector('[data-testid="tool-call-trigger-status-segment-1"]')
    const firstName = first?.querySelector('[data-testid="tool-call-trigger-name-segment-1"]')
    const firstReason = first?.querySelector('[data-testid="tool-call-trigger-reason-segment-1"]')
    const firstDuration = first?.querySelector('[data-testid="tool-call-trigger-duration-segment-1"]')
    const firstDurationSlot = firstDuration?.parentElement
    const firstChevron = first?.querySelector('[data-testid="tool-call-chevron-segment-1"]')
    expect(first?.classList.contains('hover:bg-slate-50/55')).toBe(true)
    expect(first?.classList.contains('duration-150')).toBe(true)
    expect(firstHeader?.classList.contains('grid-cols-[auto_minmax(0,1fr)_auto_auto]')).toBe(true)
    expect(firstStatus?.classList.contains('h-5')).toBe(true)
    expect(firstStatus?.classList.contains('rounded-md')).toBe(true)
    expect(firstStatus?.classList.contains('border-emerald-200/70')).toBe(true)
    expect(firstStatus?.classList.contains('bg-emerald-50/85')).toBe(true)
    expect(firstStatus?.querySelector('svg')?.classList.contains('text-emerald-700')).toBe(true)
    expect(firstStatus?.classList.contains('motion-reduce:transition-none')).toBe(true)
    expect(firstName?.textContent).toBe('tool_1')
    expect(firstName?.classList.contains('uppercase')).toBe(true)
    expect(firstReason?.textContent).toBe('Reason 1')
    expect(firstReason?.classList.contains('truncate')).toBe(true)
    expect(firstDuration?.textContent).toBe('0.02s')
    expect(firstDurationSlot?.classList.contains('opacity-[0.45]')).toBe(false)
    expect(firstChevron?.classList.contains('h-3.5')).toBe(true)
    expect(firstChevron?.classList.contains('w-3.5')).toBe(true)
    expect(firstChevron?.classList.contains('transition-transform')).toBe(true)
    expect(firstChevron?.classList.contains('opacity-[0.45]')).toBe(false)
    expect(firstChevron?.classList.contains('motion-reduce:transition-none')).toBe(true)
    await act(async () => first?.click())

    expect(first?.getAttribute('aria-expanded')).toBe('true')
    expect(first?.classList.contains('bg-slate-50/45')).toBe(true)
    expect(firstStatus?.classList.contains('scale-[1.03]')).toBe(true)
    expect(firstChevron?.classList.contains('rotate-180')).toBe(true)
    expect(container.querySelectorAll('[data-testid="tool-call-inspector-details"]')).toHaveLength(1)
    expect(container.querySelector('[data-testid="tool-call-inline-panel-segment-1"]')?.getAttribute('data-state')).toBe('expanded')
    const firstSurface = container.querySelector('[data-testid="tool-call-detail-surface-segment-1"]')
    expect(firstSurface?.classList.contains('border-slate-200/35')).toBe(true)
    expect(firstSurface?.classList.contains('bg-gray-100/45')).toBe(true)
    const firstDetails = container.querySelector('[data-testid="tool-call-inspector-details"]')

    await act(async () => second?.click())

    expect(first?.getAttribute('aria-expanded')).toBe('false')
    expect(second?.getAttribute('aria-expanded')).toBe('true')
    expect(container.querySelector('[data-testid="tool-call-inline-panel-segment-1"]')?.getAttribute('data-state')).toBe('collapsed')
    expect(container.querySelector('[data-testid="tool-call-inline-panel-segment-2"]')?.getAttribute('data-state')).toBe('expanded')
    expect(container.contains(firstDetails)).toBe(true)
    expect(container.querySelectorAll('[data-testid="tool-call-inspector-details"]')).toHaveLength(2)
  })

  it('toggles the inline detail when the chevron is clicked', async () => {
    await act(async () => root.render(<ToolCallGroup items={[toolCallItem('1', 0)]} />))
    const row = container.querySelector<HTMLButtonElement>('[data-testid="support-segment-row-segment-1"]')
    const chevron = container.querySelector('[data-testid="tool-call-chevron-segment-1"]')

    await act(async () => {
      chevron?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(row?.getAttribute('aria-expanded')).toBe('true')
    expect(container.querySelector('[data-testid="tool-call-inline-panel-segment-1"]')?.getAttribute('data-state')).toBe('expanded')
  })

  it('uses the full available width inside a completed-work disclosure', async () => {
    await act(async () => root.render(
      <ToolCallGroup items={[toolCallItem('1', 0)]} fullWidth nestedDisclosure />
    ))

    const group = container.querySelector('[data-testid="tool-call-group"]')
    const row = container.querySelector<HTMLButtonElement>(
      '[data-testid="support-segment-row-segment-1"]'
    )
    const duration = container.querySelector(
      '[data-testid="tool-call-trigger-duration-segment-1"]'
    )
    const durationSlot = duration?.parentElement
    const chevron = container.querySelector('[data-testid="tool-call-chevron-segment-1"]')
    expect(group?.classList.contains('w-full')).toBe(true)
    expect(group?.classList.contains('w-[90%]')).toBe(false)
    expect(chevron?.classList.contains('h-3')).toBe(true)
    expect(chevron?.classList.contains('w-3')).toBe(true)
    expect(chevron?.classList.contains('h-3.5')).toBe(false)
    expect(chevron?.classList.contains('transition-[transform,opacity]')).toBe(true)
    expect(chevron?.classList.contains('opacity-[0.45]')).toBe(true)
    expect(chevron?.classList.contains('group-hover/support:opacity-80')).toBe(true)
    expect(chevron?.classList.contains('group-focus-visible/support:opacity-80')).toBe(true)
    expect(chevron?.classList.contains('motion-reduce:transition-none')).toBe(true)
    expect(durationSlot?.classList.contains('transition-opacity')).toBe(true)
    expect(durationSlot?.classList.contains('opacity-[0.45]')).toBe(true)
    expect(durationSlot?.classList.contains('group-hover/support:opacity-80')).toBe(true)
    expect(durationSlot?.classList.contains('group-focus-visible/support:opacity-80')).toBe(true)
    expect(durationSlot?.classList.contains('motion-reduce:transition-none')).toBe(true)

    await act(async () => row?.click())
    expect(row?.getAttribute('aria-expanded')).toBe('true')
    expect(chevron?.classList.contains('rotate-180')).toBe(true)
    expect(chevron?.classList.contains('opacity-80')).toBe(true)
    expect(chevron?.classList.contains('opacity-[0.45]')).toBe(false)
    expect(durationSlot?.classList.contains('opacity-80')).toBe(true)
    expect(durationSlot?.classList.contains('opacity-[0.45]')).toBe(false)
  })

  it('uses restrained append motion and disables it for reduced motion', async () => {
    await act(async () => root.render(<ToolCallGroup items={[toolCallItem('1', 0)]} />))
    const animatedRow = container.querySelector('[data-testid="tool-call-group-row-segment-1"]')

    expect(animatedRow?.getAttribute('data-motion-initial')).toContain('"x":-6')
    expect(animatedRow?.getAttribute('data-motion-initial')).toContain('"scale":0.995')
    expect(animatedRow?.getAttribute('data-motion-animate')).toContain('"x":0')

    await act(async () => {
      root.render(<ToolCallGroup items={[toolCallItem('1', 0)]} forceReducedMotion />)
    })
    const reducedRow = container.querySelector('[data-testid="tool-call-group-row-segment-1"]')
    expect(reducedRow?.getAttribute('data-motion-initial')).toBe('false')
    expect(reducedRow?.getAttribute('data-motion-animate')).toBeNull()
    expect(reducedRow?.getAttribute('data-motion-transition')).toBeNull()
  })

  it('silently selects an expanded row while preserving the Artifacts panel state', async () => {
    await act(async () => root.render(<ToolCallGroup items={[toolCallItem('1', 0)]} />))
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="support-segment-row-segment-1"]')?.click()
    })

    expect(useChatStore.getState()).toMatchObject({
      artifactsPanelOpen: false,
      artifactsActiveTab: 'stats',
      toolCallInspectorSelection: {
        chatUuid: 'chat-1',
        segmentId: 'segment-1',
        toolCallId: '1'
      }
    })
    expect(container.querySelector('button[aria-label="Open tool_1 in Tools"]')).toBeNull()

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="support-segment-row-segment-1"]')?.click()
    })

    expect(useChatStore.getState()).toMatchObject({
      artifactsPanelOpen: false,
      artifactsActiveTab: 'stats',
      toolCallInspectorSelection: {
        chatUuid: 'chat-1',
        segmentId: 'segment-1',
        toolCallId: '1'
      }
    })
  })

  it('keeps running and failed calls visible when a long list is compressed', async () => {
    const items = Array.from({ length: 10 }, (_, index) => toolCallItem(
      String(index),
      index,
      index === 5 ? 'running' : index === 6 ? 'failed' : 'completed'
    ))
    await act(async () => root.render(<ToolCallGroup items={items} />))

    expect(container.querySelector('[data-testid="support-segment-row-segment-5"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="support-segment-row-segment-6"]')).toBeTruthy()
    const runningStatus = container.querySelector('[data-testid="tool-call-trigger-status-segment-5"]')
    const failedStatus = container.querySelector('[data-testid="tool-call-trigger-status-segment-6"]')
    expect(runningStatus?.classList.contains('border-amber-200/70')).toBe(true)
    expect(runningStatus?.classList.contains('bg-amber-50/85')).toBe(true)
    expect(runningStatus?.querySelector('svg')?.classList.contains('text-amber-700')).toBe(true)
    expect(runningStatus?.querySelector('svg')?.classList.contains('animate-spin')).toBe(true)
    expect(runningStatus?.querySelector('svg')?.classList.contains('motion-reduce:animate-none')).toBe(true)
    expect(failedStatus?.classList.contains('border-red-200/70')).toBe(true)
    expect(failedStatus?.classList.contains('bg-red-50/85')).toBe(true)
    expect(failedStatus?.querySelector('svg')?.classList.contains('text-red-600')).toBe(true)
    expect(container.textContent).toContain('Show 2 more tool calls')
  })
})

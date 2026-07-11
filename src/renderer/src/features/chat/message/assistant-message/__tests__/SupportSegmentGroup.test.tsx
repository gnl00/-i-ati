// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TOOL_CALL_REASON_PARAMETER_NAME } from '@shared/tools/definitions-utils'
import type { SupportSegmentRenderItem } from '../model/assistantMessageMapper'

vi.mock('framer-motion', async () => {
  const React = await import('react')

  const motionProp = (value: unknown) => {
    if (value === undefined) {
      return undefined
    }

    if (typeof value === 'string') {
      return value
    }

    return JSON.stringify(value)
  }

  const passthrough = (tag: string) => (
    React.forwardRef<HTMLElement, Record<string, unknown> & { children?: React.ReactNode }>(({
      children,
      animate,
      exit,
      initial,
      layout,
      transition,
      ...props
    }, ref) => React.createElement(tag, {
      ...props,
      ref,
      'data-motion-animate': motionProp(animate),
      'data-motion-exit': motionProp(exit),
      'data-motion-initial': motionProp(initial),
      'data-motion-layout': motionProp(layout),
      'data-motion-transition': motionProp(transition)
    } as any, children as React.ReactNode))
  )

  return {
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    motion: {
      div: passthrough('div')
    },
    useReducedMotion: () => false
  }
})

import {
  projectSupportSegmentPhases,
  SupportSegmentGroup
} from '../renderers/SupportSegmentGroup'

const toolCallItem = (args: {
  id: string
  name?: string
  order: number
  status?: string
  isError?: boolean
  reason?: string
}): SupportSegmentRenderItem => ({
  key: args.id,
  layer: 'committed',
  sourceIndex: args.order,
  order: args.order,
  isStreamingTail: false,
  segment: {
    type: 'toolCall',
    segmentId: `segment-${args.id}`,
    name: args.name ?? args.id,
    content: {
      toolName: args.name ?? args.id,
      args: {
        input: args.id,
        ...(args.reason ? { [TOOL_CALL_REASON_PARAMETER_NAME]: args.reason } : {})
      },
      status: args.status ?? 'completed'
    },
    isError: args.isError ?? false,
    timestamp: 1,
    toolCallId: args.id,
    toolCallIndex: args.order,
    cost: args.status === 'running' || args.status === 'pending' ? undefined : 12
  }
})

const reasoningItem = (args: {
  id: string
  order: number
}): SupportSegmentRenderItem => ({
  key: args.id,
  layer: 'committed',
  sourceIndex: args.order,
  order: args.order,
  isStreamingTail: false,
  segment: {
    type: 'reasoning',
    segmentId: `segment-${args.id}`,
    content: `Thought ${args.id}`,
    timestamp: 1,
    endedAt: 1001
  }
})

const mixedItems = (): SupportSegmentRenderItem[] => [
  toolCallItem({ id: 'tool-1', name: 'read', order: 0 }),
  reasoningItem({ id: 'thought-1', order: 1 }),
  toolCallItem({ id: 'tool-2', name: 'grep', order: 2 }),
  reasoningItem({ id: 'thought-2', order: 3 }),
  toolCallItem({ id: 'tool-3', name: 'write', order: 4 })
]

const row = (container: HTMLElement, id: string): HTMLElement | null => (
  container.querySelector(`[data-testid="support-segment-row-segment-${id}"]`)
)

const middlePanel = (container: HTMLElement): HTMLElement | null => (
  container.querySelector('[data-testid="support-segment-middle-panel"]')
)

const supportRowIdsInDomOrder = (container: HTMLElement): string[] => (
  Array.from(container.querySelectorAll<HTMLElement>('[data-testid^="support-segment-row-segment-"]'))
    .map(element => element.dataset.testid?.replace('support-segment-row-segment-', '') ?? '')
)

const expectCollapseRowAfterSupportRow = (
  container: HTMLElement,
  id: string
) => {
  const supportRow = row(container, id)
  const collapseRow = container.querySelector('[data-testid="support-segment-collapse-row"]')

  expect(supportRow).toBeTruthy()
  expect(collapseRow).toBeTruthy()
  expect(supportRow?.compareDocumentPosition(collapseRow as Node) ?? 0).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
}

describe('SupportSegmentGroup', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('projects contiguous support items into phases', () => {
    const phases = projectSupportSegmentPhases([
      toolCallItem({ id: 'tool-1', order: 0 }),
      toolCallItem({ id: 'tool-2', order: 1 }),
      reasoningItem({ id: 'thought-1', order: 2 }),
      toolCallItem({ id: 'tool-3', order: 3 }),
      reasoningItem({ id: 'thought-2', order: 4 }),
      reasoningItem({ id: 'thought-3', order: 5 })
    ])

    expect(phases.map(phase => (
      phase.kind === 'singleItem'
        ? `${phase.kind}:1`
        : `${phase.kind}:${phase.items.length}`
    ))).toEqual([
      'toolPhase:2',
      'thoughtPhase:1',
      'toolPhase:1',
      'thoughtPhase:2'
    ])
  })

  it('keeps phase keys anchored to the first item while appending to a phase', () => {
    const initialPhases = projectSupportSegmentPhases([
      toolCallItem({ id: 'tool-1', order: 0 }),
      toolCallItem({ id: 'tool-2', order: 1 })
    ])
    const appendedPhases = projectSupportSegmentPhases([
      toolCallItem({ id: 'tool-1', order: 0 }),
      toolCallItem({ id: 'tool-2', order: 1 }),
      toolCallItem({ id: 'tool-3', order: 2 })
    ])

    expect(initialPhases[0]?.key).toBe('toolPhase:tool-1')
    expect(appendedPhases[0]?.key).toBe(initialPhases[0]?.key)
  })

  it('collapses completed groups longer than three items into first, summary, and last rows', async () => {
    await act(async () => {
      root.render(<SupportSegmentGroup items={mixedItems()} />)
    })

    expect(container.querySelector('[data-testid="support-segment-group"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="support-segment-group"]')?.className).toContain('max-w-[680px]')
    expect(container.querySelector('[data-testid="support-segment-group"]')?.className).toContain('overflow-hidden')
    expect(container.querySelector('[data-testid="support-segment-group"]')?.getAttribute('data-state')).toBe('collapsed')
    expect(container.querySelector('[data-testid="support-segment-group"]')?.getAttribute('data-motion-layout')).toBeNull()
    expect(middlePanel(container)?.getAttribute('data-state')).toBe('collapsed')
    expect(middlePanel(container)?.getAttribute('aria-hidden')).toBe('true')
    expect(middlePanel(container)?.hasAttribute('inert')).toBe(true)
    expect(row(container, 'tool-1')).toBeTruthy()
    expect(row(container, 'tool-3')).toBeTruthy()
    expect(row(container, 'thought-1')).toBeTruthy()
    expect(row(container, 'tool-2')).toBeTruthy()
    expect(row(container, 'thought-2')).toBeTruthy()
    expect(container.querySelector('[data-testid="support-segment-summary-row"]')?.textContent).toContain('+3 hidden')
    expect(container.querySelector('[data-testid="support-segment-summary-row"]')?.textContent).toContain('1 tool')
    expect(container.querySelector('[data-testid="support-segment-summary-row"]')?.textContent).toContain('2 thoughts')
    expect(container.querySelectorAll('[data-testid="support-segment-phase-tool"]')).toHaveLength(3)
    expect(container.querySelector('[data-testid="support-segment-summary-footer"]')).toBeNull()
  })

  it('auto-collapses forced expanded groups after running and pending tools settle', async () => {
    const runningItems = [
      toolCallItem({ id: 'tool-1', order: 0 }),
      reasoningItem({ id: 'thought-1', order: 1 }),
      toolCallItem({ id: 'tool-2', order: 2, status: 'running' }),
      reasoningItem({ id: 'thought-2', order: 3 }),
      toolCallItem({ id: 'tool-3', order: 4, status: 'pending' })
    ]
    const completedItems = [
      toolCallItem({ id: 'tool-1', order: 0 }),
      reasoningItem({ id: 'thought-1', order: 1 }),
      toolCallItem({ id: 'tool-2', order: 2 }),
      reasoningItem({ id: 'thought-2', order: 3 }),
      toolCallItem({ id: 'tool-3', order: 4 })
    ]

    await act(async () => {
      root.render(<SupportSegmentGroup items={runningItems} />)
    })

    const groupShell = container.querySelector('[data-testid="support-segment-group"]')
    expect(groupShell?.getAttribute('data-state')).toBe('expanded')
    expect(container.querySelector('[data-testid="support-segment-summary-row"]')).toBeNull()
    expect(row(container, 'tool-1')).toBeTruthy()
    expect(row(container, 'thought-1')).toBeTruthy()
    expect(row(container, 'tool-2')).toBeTruthy()
    expect(row(container, 'thought-2')).toBeTruthy()
    expect(row(container, 'tool-3')).toBeTruthy()

    await act(async () => {
      root.render(<SupportSegmentGroup items={completedItems} />)
    })

    const summaryRow = container.querySelector('[data-testid="support-segment-summary-row"]')
    expect(container.querySelector('[data-testid="support-segment-group"]')).toBe(groupShell)
    expect(container.querySelector('[data-testid="support-segment-group"]')?.getAttribute('data-state')).toBe('collapsed')
    expect(middlePanel(container)?.getAttribute('data-state')).toBe('collapsed')
    expect(middlePanel(container)?.getAttribute('aria-hidden')).toBe('true')
    expect(middlePanel(container)?.hasAttribute('inert')).toBe(true)
    expect(summaryRow?.textContent).toContain('+3 hidden')
    expect(summaryRow?.textContent).toContain('1 tool')
    expect(summaryRow?.textContent).toContain('2 thoughts')
    expect(row(container, 'tool-1')).toBeTruthy()
    expect(row(container, 'tool-3')).toBeTruthy()
    expect(row(container, 'thought-1')).toBeTruthy()
    expect(row(container, 'tool-2')).toBeTruthy()
    expect(row(container, 'thought-2')).toBeTruthy()
  })

  it('expands collapsed groups from the summary row', async () => {
    await act(async () => {
      root.render(<SupportSegmentGroup items={mixedItems()} />)
    })

    const summaryRow = container.querySelector<HTMLButtonElement>('[data-testid="support-segment-summary-row"]')
    const collapsedPanel = middlePanel(container)
    expect(summaryRow).toBeTruthy()
    expect(collapsedPanel).toBeTruthy()
    expect(collapsedPanel?.getAttribute('data-state')).toBe('collapsed')

    await act(async () => {
      summaryRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const expandedPanel = middlePanel(container)
    expect(row(container, 'tool-1')).toBeTruthy()
    expect(row(container, 'thought-1')).toBeTruthy()
    expect(row(container, 'tool-2')).toBeTruthy()
    expect(row(container, 'thought-2')).toBeTruthy()
    expect(row(container, 'tool-3')).toBeTruthy()
    expect(expandedPanel).toBe(collapsedPanel)
    expect(expandedPanel?.getAttribute('data-state')).toBe('expanded')
    expect(expandedPanel?.getAttribute('aria-hidden')).toBeNull()
    expect(expandedPanel?.hasAttribute('inert')).toBe(false)
    const collapseRow = container.querySelector<HTMLButtonElement>('[data-testid="support-segment-collapse-row"]')
    expect(collapseRow).toBeTruthy()
    expect(collapseRow?.textContent).toContain('Hide')
    expect(container.querySelector('[data-testid="support-segment-summary-header"]')).toBeNull()
    expect(container.querySelector('[data-testid="support-segment-summary-footer"]')).toBeNull()
    expect(container.textContent).not.toContain('Complete · 5 steps · 3 tools')
    expect(container.querySelectorAll('[data-testid="support-segment-phase-tool"]')).toHaveLength(3)
    expect(container.querySelectorAll('[data-testid="support-segment-phase-thought"]')).toHaveLength(2)
    expect(supportRowIdsInDomOrder(container)).toEqual([
      'tool-1',
      'thought-1',
      'tool-2',
      'thought-2',
      'tool-3'
    ])
    expectCollapseRowAfterSupportRow(container, 'tool-3')

    await act(async () => {
      collapseRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelector('[data-testid="support-segment-summary-row"]')).toBeTruthy()
    expect(middlePanel(container)).toBe(collapsedPanel)
    expect(middlePanel(container)?.getAttribute('data-state')).toBe('collapsed')
    expect(middlePanel(container)?.getAttribute('aria-hidden')).toBe('true')
    expect(middlePanel(container)?.hasAttribute('inert')).toBe(true)
    expect(row(container, 'tool-1')).toBeTruthy()
    expect(row(container, 'tool-3')).toBeTruthy()
    expect(row(container, 'thought-1')).toBeTruthy()
    expect(row(container, 'tool-2')).toBeTruthy()
    expect(row(container, 'thought-2')).toBeTruthy()
  })

  it('renders expanded mixed sequences in item order with hide after the final row', async () => {
    await act(async () => {
      root.render(<SupportSegmentGroup items={mixedItems()} />)
    })

    const summaryRow = container.querySelector<HTMLButtonElement>('[data-testid="support-segment-summary-row"]')

    await act(async () => {
      summaryRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(supportRowIdsInDomOrder(container)).toEqual([
      'tool-1',
      'thought-1',
      'tool-2',
      'thought-2',
      'tool-3'
    ])
    expect(container.querySelectorAll('[data-testid="support-segment-phase-tool"]')).toHaveLength(3)
    expect(container.querySelectorAll('[data-testid="support-segment-phase-thought"]')).toHaveLength(2)
    expectCollapseRowAfterSupportRow(container, 'tool-3')
  })

  it('keeps adjacent middle thoughts in one expanded phase with hide after the final row', async () => {
    await act(async () => {
      root.render(<SupportSegmentGroup items={[
        toolCallItem({ id: 'tool-1', order: 0 }),
        reasoningItem({ id: 'thought-1', order: 1 }),
        reasoningItem({ id: 'thought-2', order: 2 }),
        toolCallItem({ id: 'tool-2', order: 3 })
      ]} />)
    })

    const summaryRow = container.querySelector<HTMLButtonElement>('[data-testid="support-segment-summary-row"]')

    await act(async () => {
      summaryRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const thoughtPhases = container.querySelectorAll('[data-testid="support-segment-phase-thought"]')

    expect(supportRowIdsInDomOrder(container)).toEqual([
      'tool-1',
      'thought-1',
      'thought-2',
      'tool-2'
    ])
    expect(thoughtPhases).toHaveLength(1)
    expect(thoughtPhases[0]?.textContent).toContain('2 steps')
    expectCollapseRowAfterSupportRow(container, 'tool-2')
  })

  it('keeps user expansion when appending a completed support item', async () => {
    await act(async () => {
      root.render(<SupportSegmentGroup items={mixedItems()} />)
    })

    const summaryRow = container.querySelector<HTMLButtonElement>('[data-testid="support-segment-summary-row"]')
    expect(summaryRow).toBeTruthy()

    await act(async () => {
      summaryRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const groupShell = container.querySelector('[data-testid="support-segment-group"]')
    expect(row(container, 'thought-1')).toBeTruthy()
    expect(row(container, 'tool-2')).toBeTruthy()

    await act(async () => {
      root.render(<SupportSegmentGroup items={[
        ...mixedItems(),
        toolCallItem({ id: 'tool-4', name: 'verify', order: 5 })
      ]} />)
    })

    expect(container.querySelector('[data-testid="support-segment-group"]')).toBe(groupShell)
    expect(container.querySelector('[data-testid="support-segment-summary-row"]')).toBeNull()
    expect(row(container, 'thought-1')).toBeTruthy()
    expect(row(container, 'tool-2')).toBeTruthy()
    expect(row(container, 'tool-4')).toBeTruthy()
    expect(supportRowIdsInDomOrder(container)).toEqual([
      'tool-1',
      'thought-1',
      'tool-2',
      'thought-2',
      'tool-3',
      'tool-4'
    ])
    expectCollapseRowAfterSupportRow(container, 'tool-4')
  })

  it('renders collapsible thought and tool regions with compact rows', async () => {
    await act(async () => {
      root.render(<SupportSegmentGroup items={[
        toolCallItem({ id: 'tool-0', order: 0 }),
        reasoningItem({ id: 'thought-1', order: 1 }),
        reasoningItem({ id: 'thought-2', order: 2 }),
        toolCallItem({ id: 'tool-1', order: 3 }),
        toolCallItem({ id: 'tool-2', order: 4 }),
        toolCallItem({ id: 'tool-3', order: 5 })
      ]} />)
    })

    const summaryRow = container.querySelector<HTMLButtonElement>('[data-testid="support-segment-summary-row"]')
    await act(async () => {
      summaryRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const panel = middlePanel(container)
    const thoughtPhases = panel?.querySelectorAll('[data-testid="support-segment-phase-thought"]')
    const toolPhases = panel?.querySelectorAll('[data-testid="support-segment-phase-tool"]')
    const timelineRows = panel?.querySelectorAll('[data-testid^="support-segment-tool-timeline-row-"]')

    expect(panel?.getAttribute('data-state')).toBe('expanded')
    expect(thoughtPhases).toHaveLength(1)
    expect(toolPhases).toHaveLength(1)
    expect(thoughtPhases?.[0]?.textContent).toContain('Thought')
    expect(thoughtPhases?.[0]?.textContent).toContain('2 steps')
    expect(toolPhases?.[0]?.textContent).toContain('Tool execution')
    expect(toolPhases?.[0]?.textContent).toContain('2 calls')
    expect(toolPhases?.[0]?.textContent).toContain('2/2 success')
    expect(toolPhases?.[0]?.textContent).toContain('0.024s total')
    expect(timelineRows).toHaveLength(2)
    expect(container.querySelector('[data-testid="support-segment-summary-footer"]')).toBeNull()
  })

  it('keeps running and pending tool groups expanded', async () => {
    await act(async () => {
      root.render(<SupportSegmentGroup items={[
        toolCallItem({ id: 'tool-1', order: 0 }),
        reasoningItem({ id: 'thought-1', order: 1 }),
        toolCallItem({ id: 'tool-2', order: 2, status: 'running' }),
        reasoningItem({ id: 'thought-2', order: 3 }),
        toolCallItem({ id: 'tool-3', order: 4, status: 'pending' })
      ]} />)
    })

    expect(container.querySelector('[data-testid="support-segment-summary-row"]')).toBeNull()
    expect(row(container, 'tool-1')).toBeTruthy()
    expect(row(container, 'thought-1')).toBeTruthy()
    expect(row(container, 'tool-2')).toBeTruthy()
    expect(row(container, 'thought-2')).toBeTruthy()
    expect(row(container, 'tool-3')).toBeTruthy()

    const collapseRow = container.querySelector<HTMLButtonElement>('[data-testid="support-segment-collapse-row"]')

    await act(async () => {
      collapseRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelector('[data-testid="support-segment-group"]')?.getAttribute('data-state')).toBe('expanded')
    expect(container.querySelector('[data-testid="support-segment-summary-row"]')).toBeNull()
  })

  it('opens failed tool groups by default and allows collapsing them', async () => {
    await act(async () => {
      root.render(<SupportSegmentGroup items={[
        toolCallItem({ id: 'tool-1', order: 0 }),
        reasoningItem({ id: 'thought-1', order: 1 }),
        toolCallItem({ id: 'tool-2', order: 2, status: 'failed', isError: true }),
        reasoningItem({ id: 'thought-2', order: 3 }),
        toolCallItem({ id: 'tool-3', order: 4 })
      ]} />)
    })

    expect(container.querySelector('[data-testid="support-segment-group"]')?.getAttribute('data-state')).toBe('expanded')
    expect(container.querySelector('[data-testid="support-segment-summary-row"]')).toBeNull()
    expect(row(container, 'tool-2')).toBeTruthy()

    const collapseRow = container.querySelector<HTMLButtonElement>('[data-testid="support-segment-collapse-row"]')

    await act(async () => {
      collapseRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelector('[data-testid="support-segment-group"]')?.getAttribute('data-state')).toBe('collapsed')
    expect(container.querySelector('[data-testid="support-segment-summary-row"]')).toBeTruthy()
    expect(middlePanel(container)?.getAttribute('data-state')).toBe('collapsed')
  })

  it('keeps groups with three items expanded', async () => {
    await act(async () => {
      root.render(<SupportSegmentGroup items={[
        toolCallItem({ id: 'tool-1', order: 0 }),
        reasoningItem({ id: 'thought-1', order: 1 }),
        toolCallItem({ id: 'tool-2', order: 2 })
      ]} />)
    })

    expect(container.querySelector('[data-testid="support-segment-summary-row"]')).toBeNull()
    expect(row(container, 'tool-1')).toBeTruthy()
    expect(row(container, 'thought-1')).toBeTruthy()
    expect(row(container, 'tool-2')).toBeTruthy()
    expect(container.querySelectorAll('[data-testid="support-segment-phase-tool"]')).toHaveLength(2)
    expect(container.querySelectorAll('[data-testid^="support-segment-tool-timeline-row-"]')).toHaveLength(0)
    container.querySelectorAll('[data-testid="support-segment-phase-tool"]').forEach((phase) => {
      expect(phase.textContent).toContain('Tool execution')
      expect(phase.textContent).toContain('1 call')
      expect(phase.textContent).not.toContain('/1 success')
      expect(phase.textContent).not.toContain('total')
    })
  })

  it('keeps the first tool row mounted when a second tool appends to the phase', async () => {
    await act(async () => {
      root.render(<SupportSegmentGroup items={[
        toolCallItem({ id: 'tool-1', name: 'read', order: 0 })
      ]} />)
    })

    const groupShell = container.querySelector('[data-testid="support-segment-group"]')
    const firstToolRow = row(container, 'tool-1')

    expect(firstToolRow).toBeTruthy()
    expect(container.querySelectorAll('[data-testid^="support-segment-tool-timeline-row-"]')).toHaveLength(0)

    await act(async () => {
      root.render(<SupportSegmentGroup items={[
        toolCallItem({ id: 'tool-1', name: 'read', order: 0 }),
        toolCallItem({ id: 'tool-2', name: 'grep', order: 1 })
      ]} />)
    })

    expect(container.querySelector('[data-testid="support-segment-group"]')).toBe(groupShell)
    expect(row(container, 'tool-1')).toBe(firstToolRow)
    expect(row(container, 'tool-2')).toBeTruthy()
    expect(row(container, 'tool-2')?.closest('[data-motion-initial]')?.getAttribute('data-motion-initial'))
      .toBe('{"opacity":0,"x":-16,"scale":0.97}')
    expect(row(container, 'tool-2')?.closest('[data-motion-transition]')?.getAttribute('data-motion-transition'))
      .toBe('{"layout":{"type":"spring","stiffness":420,"damping":36,"mass":0.8},"x":{"type":"spring","stiffness":400,"damping":30,"mass":0.7},"opacity":{"duration":0.16,"ease":[0.22,1,0.36,1]},"scale":{"type":"spring","stiffness":420,"damping":32,"mass":0.6}}')
    expect(container.querySelectorAll('[data-testid^="support-segment-tool-timeline-row-"]')).toHaveLength(2)
    expect(container.querySelector('[data-testid="support-segment-phase-tool"]')?.textContent).toContain('2 calls')
  })

  it('applies horizontal slide-in animation to appended thought rows', async () => {
    await act(async () => {
      root.render(<SupportSegmentGroup items={[
        reasoningItem({ id: 'thought-1', order: 0 })
      ]} />)
    })

    const groupShell = container.querySelector('[data-testid="support-segment-group"]')
    const firstThoughtRow = row(container, 'thought-1')

    expect(firstThoughtRow).toBeTruthy()

    await act(async () => {
      root.render(<SupportSegmentGroup items={[
        reasoningItem({ id: 'thought-1', order: 0 }),
        reasoningItem({ id: 'thought-2', order: 1 })
      ]} />)
    })

    expect(container.querySelector('[data-testid="support-segment-group"]')).toBe(groupShell)
    expect(row(container, 'thought-1')).toBe(firstThoughtRow)
    expect(row(container, 'thought-2')).toBeTruthy()
    expect(row(container, 'thought-2')?.closest('[data-motion-initial]')?.getAttribute('data-motion-initial'))
      .toBe('{"opacity":0,"x":-12,"scale":0.98}')
    expect(row(container, 'thought-2')?.closest('[data-motion-animate]')?.getAttribute('data-motion-animate'))
      .toBe('{"opacity":1,"x":0,"scale":1}')
    expect(row(container, 'thought-2')?.closest('[data-motion-transition]')?.getAttribute('data-motion-transition'))
      .toBe('{"layout":{"type":"spring","stiffness":420,"damping":36,"mass":0.8},"x":{"type":"spring","stiffness":400,"damping":30,"mass":0.7},"opacity":{"duration":0.16,"ease":[0.22,1,0.36,1]},"scale":{"type":"spring","stiffness":420,"damping":32,"mass":0.6}}')
  })

  it('renders tool call reasons in grouped tool rows', async () => {
    await act(async () => {
      root.render(<SupportSegmentGroup items={[
        toolCallItem({
          id: 'tool-1',
          name: 'read',
          order: 0,
          reason: 'Read the current component first.'
        }),
        reasoningItem({ id: 'thought-1', order: 1 }),
        toolCallItem({
          id: 'tool-2',
          name: 'grep',
          order: 2,
          reason: 'Find the matching test expectations.'
        })
      ]} />)
    })

    expect(row(container, 'tool-1')?.textContent).toContain('Read the current component first.')
    expect(row(container, 'tool-2')?.textContent).toContain('Find the matching test expectations.')

    const triggerContent = container.querySelector('[data-testid="tool-call-trigger-content-segment-tool-1"]')
    const triggerReason = container.querySelector('[data-testid="tool-call-trigger-reason-segment-tool-1"]')
    const triggerDuration = container.querySelector('[data-testid="tool-call-trigger-duration-segment-tool-1"]')

    expect(triggerContent?.className).toContain('grid-cols-[auto_minmax(0,1fr)_auto]')
    expect(triggerContent?.className).toContain('gap-x-2')
    expect(triggerReason?.className).toContain('truncate')
    expect(triggerReason?.className).toContain('text-slate-500')
    expect(triggerDuration?.className).toContain('justify-self-end')
  })

  it('updates grouped pending tool row reasons when streamed args add them', async () => {
    const reason = 'Read the current grouped row implementation.'

    await act(async () => {
      root.render(<SupportSegmentGroup items={[
        toolCallItem({
          id: 'tool-1',
          name: 'read',
          order: 0,
          status: 'pending'
        })
      ]} />)
    })

    expect(container.querySelector('[data-testid="tool-call-trigger-reason-segment-tool-1"]')).toBeNull()

    await act(async () => {
      root.render(<SupportSegmentGroup items={[
        toolCallItem({
          id: 'tool-1',
          name: 'read',
          order: 0,
          status: 'pending',
          reason
        })
      ]} />)
    })

    expect(container.querySelector('[data-testid="tool-call-trigger-reason-segment-tool-1"]')?.textContent)
      .toBe(reason)
  })

  it('renders static panel and row motion when reduced motion is forced', async () => {
    await act(async () => {
      root.render(<SupportSegmentGroup items={mixedItems()} forceReducedMotion />)
    })

    const panel = middlePanel(container)
    const middleRowMotion = row(container, 'tool-2')?.closest('[data-motion-initial]')

    expect(panel?.className).toContain('transition-none')
    expect(panel?.getAttribute('data-state')).toBe('collapsed')
    expect(middleRowMotion?.getAttribute('data-motion-layout')).toBe('false')
    expect(middleRowMotion?.getAttribute('data-motion-initial')).toBe('false')
    expect(middleRowMotion?.getAttribute('data-motion-animate')).toBeNull()
  })
})

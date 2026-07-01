// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TOOL_CALL_REASON_PARAMETER_NAME } from '@shared/tools/definitions-utils'
import type { SupportSegmentRenderItem } from '../model/assistantMessageMapper'
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

  it('collapses completed groups longer than three items into first, summary, and last rows', async () => {
    await act(async () => {
      root.render(<SupportSegmentGroup items={mixedItems()} />)
    })

    expect(container.querySelector('[data-testid="support-segment-group"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="support-segment-group"]')?.className).toContain('max-w-[680px]')
    expect(row(container, 'tool-1')).toBeTruthy()
    expect(row(container, 'tool-3')).toBeTruthy()
    expect(row(container, 'thought-1')).toBeNull()
    expect(row(container, 'tool-2')).toBeNull()
    expect(row(container, 'thought-2')).toBeNull()
    expect(container.querySelector('[data-testid="support-segment-summary-row"]')?.textContent).toContain('+3 hidden')
    expect(container.querySelector('[data-testid="support-segment-summary-row"]')?.textContent).toContain('1 tool')
    expect(container.querySelector('[data-testid="support-segment-summary-row"]')?.textContent).toContain('2 thoughts')
    expect(container.querySelectorAll('[data-testid="support-segment-phase-tool"]')).toHaveLength(2)
    expect(container.querySelector('[data-testid="support-segment-summary-footer"]')).toBeNull()
  })

  it('expands collapsed groups from the summary row', async () => {
    await act(async () => {
      root.render(<SupportSegmentGroup items={mixedItems()} />)
    })

    const summaryRow = container.querySelector<HTMLButtonElement>('[data-testid="support-segment-summary-row"]')
    expect(summaryRow).toBeTruthy()

    await act(async () => {
      summaryRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(row(container, 'tool-1')).toBeTruthy()
    expect(row(container, 'thought-1')).toBeTruthy()
    expect(row(container, 'tool-2')).toBeTruthy()
    expect(row(container, 'thought-2')).toBeTruthy()
    expect(row(container, 'tool-3')).toBeTruthy()
    const collapseRow = container.querySelector<HTMLButtonElement>('[data-testid="support-segment-collapse-row"]')
    expect(collapseRow).toBeTruthy()
    expect(collapseRow?.textContent).toContain('Hide')
    expect(container.querySelector('[data-testid="support-segment-summary-header"]')).toBeNull()
    expect(container.querySelector('[data-testid="support-segment-summary-footer"]')).toBeNull()
    expect(container.textContent).not.toContain('Complete · 5 steps · 3 tools')
    expect(container.querySelectorAll('[data-testid="support-segment-phase-tool"]')).toHaveLength(3)
    expect(container.querySelectorAll('[data-testid="support-segment-phase-thought"]')).toHaveLength(2)

    await act(async () => {
      collapseRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelector('[data-testid="support-segment-summary-row"]')).toBeTruthy()
    expect(row(container, 'tool-1')).toBeTruthy()
    expect(row(container, 'tool-3')).toBeTruthy()
    expect(row(container, 'thought-1')).toBeNull()
    expect(row(container, 'tool-2')).toBeNull()
    expect(row(container, 'thought-2')).toBeNull()
  })

  it('renders thought and tool phases with compact metrics and timeline rows', async () => {
    await act(async () => {
      root.render(<SupportSegmentGroup items={[
        reasoningItem({ id: 'thought-1', order: 0 }),
        reasoningItem({ id: 'thought-2', order: 1 }),
        toolCallItem({ id: 'tool-1', order: 2 }),
        toolCallItem({ id: 'tool-2', order: 3 })
      ]} />)
    })

    const summaryRow = container.querySelector<HTMLButtonElement>('[data-testid="support-segment-summary-row"]')
    await act(async () => {
      summaryRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const thoughtPhase = container.querySelector('[data-testid="support-segment-phase-thought"]')
    const toolPhase = container.querySelector('[data-testid="support-segment-phase-tool"]')
    const timelineRows = container.querySelectorAll('[data-testid^="support-segment-tool-timeline-row-"]')

    expect(thoughtPhase?.textContent).toContain('Thought')
    expect(thoughtPhase?.textContent).toContain('2 steps')
    expect(thoughtPhase?.textContent).toContain('2s')
    expect(toolPhase?.textContent).toContain('Tool execution')
    expect(toolPhase?.textContent).toContain('2 calls')
    expect(toolPhase?.textContent).toContain('2/2 success')
    expect(toolPhase?.textContent).toContain('0.024s total')
    expect(toolPhase?.textContent).not.toContain('avg')
    expect(timelineRows).toHaveLength(2)
    expect(container.querySelector('[data-testid="support-segment-summary-footer"]')).toBeNull()
    expect(container.textContent).not.toContain('Complete · 4 steps · 2 tools')
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
  })

  it('keeps failed tool groups expanded', async () => {
    await act(async () => {
      root.render(<SupportSegmentGroup items={[
        toolCallItem({ id: 'tool-1', order: 0 }),
        reasoningItem({ id: 'thought-1', order: 1 }),
        toolCallItem({ id: 'tool-2', order: 2, status: 'failed', isError: true }),
        reasoningItem({ id: 'thought-2', order: 3 }),
        toolCallItem({ id: 'tool-3', order: 4 })
      ]} />)
    })

    expect(container.querySelector('[data-testid="support-segment-summary-row"]')).toBeNull()
    expect(row(container, 'tool-2')).toBeTruthy()
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
})

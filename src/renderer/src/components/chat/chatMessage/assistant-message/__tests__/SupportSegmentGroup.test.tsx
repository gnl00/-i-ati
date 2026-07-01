// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SupportSegmentRenderItem } from '../model/assistantMessageMapper'
import { SupportSegmentGroup } from '../renderers/SupportSegmentGroup'

const toolCallItem = (args: {
  id: string
  name?: string
  order: number
  status?: string
  isError?: boolean
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
      args: { input: args.id },
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

  it('collapses completed groups longer than three items into first, summary, and last rows', async () => {
    await act(async () => {
      root.render(<SupportSegmentGroup items={mixedItems()} />)
    })

    expect(container.querySelector('[data-testid="support-segment-group"]')).toBeTruthy()
    expect(row(container, 'tool-1')).toBeTruthy()
    expect(row(container, 'tool-3')).toBeTruthy()
    expect(row(container, 'thought-1')).toBeNull()
    expect(row(container, 'tool-2')).toBeNull()
    expect(row(container, 'thought-2')).toBeNull()
    expect(container.querySelector('[data-testid="support-segment-summary-row"]')?.textContent).toContain('+3 steps')
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
    expect(container.querySelector('[data-testid="support-segment-summary-header"]')?.textContent).toContain('3 Tool(s) and 2 Thought(s)')
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
  })
})

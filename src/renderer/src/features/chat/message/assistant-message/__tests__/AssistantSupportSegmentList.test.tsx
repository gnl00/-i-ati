// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TOOL_CALL_REASON_PARAMETER_NAME } from '@shared/tools/definitions-utils'
import { AssistantSupportSegmentList } from '../renderers/AssistantSupportSegmentList'
import type { SupportSegmentRenderItem } from '../model/assistantMessageMapper'
import { buildSupportRenderUnits } from '../model/assistantSupportGrouping'

vi.mock('../renderers/AssistantSupportSegmentContent', () => ({
  AssistantSupportSegmentContent: ({ item }: { item: SupportSegmentRenderItem }) => {
    const args = item.segment.type === 'toolCall' && item.segment.content?.args
    const reason = args && typeof args === 'object' && !Array.isArray(args)
      ? (args as Record<string, unknown>)[TOOL_CALL_REASON_PARAMETER_NAME]
      : undefined

    return (
      <div data-testid={`support-content-${item.segment.segmentId}`}>
        {item.segment.type === 'toolCall' ? item.segment.name : item.segment.type}
        {typeof reason === 'string' ? reason : null}
      </div>
    )
  }
}))

vi.mock('../renderers/SupportSegmentGroup', () => ({
  SupportSegmentGroup: ({ items }: { items: SupportSegmentRenderItem[] }) => (
    <div data-testid="support-segment-group">
      {items.map((item) => {
        const args = item.segment.type === 'toolCall' && item.segment.content?.args
        const reason = args && typeof args === 'object' && !Array.isArray(args)
          ? (args as Record<string, unknown>)[TOOL_CALL_REASON_PARAMETER_NAME]
          : undefined

        return (
          <span key={item.key}>
            {item.segment.type === 'toolCall' ? item.segment.name : item.segment.type}
            {typeof reason === 'string' ? reason : null}
          </span>
        )
      })}
    </div>
  ),
  areSupportSegmentRenderItemsEqual: (
    previous: SupportSegmentRenderItem,
    next: SupportSegmentRenderItem
  ) => previous.key === next.key && previous.segment === next.segment,
  areSupportSegmentRenderItemListsEqual: (
    previous: SupportSegmentRenderItem[],
    next: SupportSegmentRenderItem[]
  ) => previous.length === next.length && previous.every((item, index) => item.key === next[index].key)
}))

const toolCallItem = (args: {
  id: string
  name: string
  order: number
  reason: string
}): SupportSegmentRenderItem => ({
  key: args.id,
  layer: 'committed',
  sourceIndex: args.order,
  order: args.order,
  isStreamingTail: false,
  segment: {
    type: 'toolCall',
    segmentId: `segment-${args.id}`,
    name: args.name,
    timestamp: 1,
    toolCallId: args.id,
    toolCallIndex: args.order,
    content: {
      toolName: args.name,
      args: {
        input: 'value',
        [TOOL_CALL_REASON_PARAMETER_NAME]: args.reason
      },
      status: 'success'
    }
  }
})

const reasoningItem = (args: {
  id: string
  order: number
  content: string
}): SupportSegmentRenderItem => ({
  key: args.id,
  layer: 'committed',
  sourceIndex: args.order,
  order: args.order,
  isStreamingTail: false,
  segment: {
    type: 'reasoning',
    segmentId: `segment-${args.id}`,
    content: args.content,
    timestamp: 1
  }
})

describe('AssistantSupportSegmentList', () => {
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

  it('passes tool call reason data into grouped support rows', async () => {
    await act(async () => {
      root.render(
        <AssistantSupportSegmentList
          units={buildSupportRenderUnits([
            toolCallItem({
              id: 'tool-1',
              name: 'read',
              order: 1,
              reason: 'Inspect the layout first.'
            }),
            toolCallItem({
              id: 'tool-2',
              name: 'search',
              order: 3,
              reason: 'Find the matching renderer path.'
            })
          ])}
        />
      )
    })

    const rows = Array.from(container.children)
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('read')
    expect(rows[1].textContent).toContain('search')
    expect(container.textContent).toContain('Inspect the layout first.')
    expect(container.textContent).toContain('Find the matching renderer path.')
  })

  it('renders grouped mixed support rows with each item visible', async () => {
    await act(async () => {
      root.render(
        <AssistantSupportSegmentList
          units={buildSupportRenderUnits([
            toolCallItem({
              id: 'tool-1',
              name: 'read',
              order: 1,
              reason: 'Inspect the layout first.'
            }),
            reasoningItem({
              id: 'thought-1',
              order: 2,
              content: 'Think through the next read.'
            }),
            toolCallItem({
              id: 'tool-2',
              name: 'shell',
              order: 3,
              reason: 'Run the focused tests.'
            })
          ])}
        />
      )
    })

    expect(container.querySelectorAll('[data-testid="support-segment-group"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-testid^="support-content-"]')).toHaveLength(0)
    expect(container.textContent).toContain('read')
    expect(container.textContent).toContain('reasoning')
    expect(container.textContent).toContain('shell')
  })
})

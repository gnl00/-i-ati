// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TOOL_CALL_REASON_PARAMETER_NAME } from '@shared/tools/definitions-utils'
import { AssistantSupportSegmentList } from '../renderers/AssistantSupportSegmentList'
import type { SupportSegmentRenderItem } from '../model/assistantMessageMapper'

vi.mock('../renderers/AssistantSupportSegmentContent', () => ({
  AssistantSupportSegmentContent: ({ item }: { item: SupportSegmentRenderItem }) => (
    <div data-testid={`support-${item.segment.segmentId}`}>
      {item.segment.type === 'toolCall' ? item.segment.name : item.segment.type}
    </div>
  )
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

  it('renders tool outputs without inline tool call reason text', async () => {
    await act(async () => {
      root.render(
        <AssistantSupportSegmentList
          items={[
            toolCallItem({
              id: 'tool-1',
              name: 'read',
              order: 1,
              reason: 'Inspect the layout first.'
            }),
            toolCallItem({
              id: 'tool-2',
              name: 'search',
              order: 2,
              reason: 'Find the matching renderer path.'
            })
          ]}
        />
      )
    })

    const rows = Array.from(container.children)
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('read')
    expect(rows[1].textContent).toContain('search')
    expect(container.textContent).not.toContain('Inspect the layout first.')
    expect(container.textContent).not.toContain('Find the matching renderer path.')
  })
})

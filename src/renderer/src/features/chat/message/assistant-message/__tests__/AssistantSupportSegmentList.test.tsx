// @vitest-environment happy-dom

import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TOOL_CALL_REASON_PARAMETER_NAME } from '@shared/tools/definitions-utils'
import { AssistantSupportSegmentList } from '../renderers/AssistantSupportSegmentList'
import type {
  SupportSegmentRenderItem,
  TextSegmentRenderItem
} from '../model/assistantMessageMapper'
import { buildSupportRenderUnits } from '../model/assistantSupportGrouping'

vi.mock('../renderers/AssistantSupportSegmentContent', () => ({
  AssistantSupportSegmentContent: ({
    item,
    fullWidth = false,
    nestedDisclosure = false,
    onTypingChange
  }: {
    item: SupportSegmentRenderItem
    fullWidth?: boolean
    nestedDisclosure?: boolean
    onTypingChange?: () => void
  }): ReactElement => {
    const args = item.segment.type === 'toolCall' && item.segment.content?.args
    const reason = args && typeof args === 'object' && !Array.isArray(args)
      ? (args as Record<string, unknown>)[TOOL_CALL_REASON_PARAMETER_NAME]
      : undefined

    return (
      <div
        data-testid={`support-content-${item.segment.segmentId}`}
        data-full-width={fullWidth}
        data-nested-disclosure={nestedDisclosure}
        data-has-typing-callback={Boolean(onTypingChange)}
        onClick={onTypingChange}
      >
        {item.segment.type === 'toolCall' ? item.segment.name : item.segment.type}
        {typeof reason === 'string' ? reason : null}
      </div>
    )
  }
}))

vi.mock('../toolcall/ToolCallGroup', () => ({
  ToolCallGroup: ({
    items,
    fullWidth = false,
    nestedDisclosure = false
  }: {
    items: SupportSegmentRenderItem[]
    fullWidth?: boolean
    nestedDisclosure?: boolean
  }): ReactElement => (
    <div
      data-testid="tool-call-group"
      data-full-width={fullWidth}
      data-nested-disclosure={nestedDisclosure}
    >
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
  )
}))

vi.mock('../model/supportSegmentEquality', () => ({
  areSupportSegmentRenderItemsEqual: (
    previous: SupportSegmentRenderItem,
    next: SupportSegmentRenderItem
  ): boolean => previous.key === next.key && previous.segment === next.segment,
  areSupportSegmentRenderItemListsEqual: (
    previous: SupportSegmentRenderItem[],
    next: SupportSegmentRenderItem[]
  ): boolean => previous.length === next.length && previous.every((item, index) => item.key === next[index].key)
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

const textItem = (args: {
  id: string
  order: number
  content: string
}): TextSegmentRenderItem => ({
  key: args.id,
  layer: 'committed',
  sourceIndex: args.order,
  order: args.order,
  segment: {
    type: 'text',
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

  it('keeps think separate from adjacent tool call groups', async () => {
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

    expect(container.querySelectorAll('[data-testid="tool-call-group"]')).toHaveLength(2)
    expect(container.querySelectorAll('[data-testid^="support-content-"]')).toHaveLength(1)
    expect(container.textContent).toContain('read')
    expect(container.textContent).toContain('reasoning')
    expect(container.textContent).toContain('shell')
  })

  it('propagates typing callbacks through standalone and completed-work Think units', async () => {
    const standaloneCallback = vi.fn()
    const standaloneUnits = buildSupportRenderUnits([
      reasoningItem({
        id: 'standalone-thought',
        order: 0,
        content: 'Follow the active reasoning tail.'
      })
    ])

    await act(async () => {
      root.render(
        <AssistantSupportSegmentList
          units={standaloneUnits}
          onTypingChange={standaloneCallback}
        />
      )
    })

    const standaloneThink = container.querySelector<HTMLDivElement>(
      '[data-testid="support-content-segment-standalone-thought"]'
    )
    expect(standaloneThink?.getAttribute('data-has-typing-callback')).toBe('true')
    await act(async () => standaloneThink?.click())
    expect(standaloneCallback).toHaveBeenCalledTimes(1)

    const completedCallback = vi.fn()
    await act(async () => {
      root.render(
        <AssistantSupportSegmentList
          units={buildSupportRenderUnits(
            [
              reasoningItem({ id: 'completed-thought-1', order: 0, content: 'One.' }),
              reasoningItem({ id: 'completed-thought-2', order: 1, content: 'Two.' }),
              reasoningItem({ id: 'completed-thought-3', order: 2, content: 'Three.' }),
              reasoningItem({ id: 'completed-thought-4', order: 3, content: 'Four.' })
            ],
            [textItem({ id: 'completed-answer', order: 4, content: 'Answer' })]
          )}
          onTypingChange={completedCallback}
        />
      )
    })

    const completedThink = container.querySelector<HTMLDivElement>(
      '[data-testid="support-content-segment-completed-thought-1"]'
    )
    expect(completedThink?.getAttribute('data-has-typing-callback')).toBe('true')
    await act(async () => completedThink?.click())
    expect(completedCallback).toHaveBeenCalledTimes(1)
  })

  it('renders projected support leaves inside the completed-work disclosure', async () => {
    const supportItems = [
      reasoningItem({
        id: 'thought-1',
        order: 0,
        content: 'Inspect the renderer.'
      }),
      toolCallItem({
        id: 'tool-1',
        name: 'read',
        order: 1,
        reason: 'Read the implementation.'
      }),
      reasoningItem({
        id: 'thought-2',
        order: 2,
        content: 'Check the boundary.'
      }),
      reasoningItem({
        id: 'thought-3',
        order: 3,
        content: 'Verify the output.'
      })
    ]

    await act(async () => {
      root.render(
        <AssistantSupportSegmentList
          units={buildSupportRenderUnits(
            supportItems,
            [textItem({
              id: 'answer-1',
              order: 4,
              content: 'Answer'
            })]
          )}
        />
      )
    })

    const trigger = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Expand completed work"]'
    )
    expect(trigger?.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelectorAll('[data-testid="tool-call-group"]')).toHaveLength(1)
    expect(container.textContent).toContain('reasoning')
    expect(container.textContent).toContain('read')
    expect(container.querySelector('[data-testid="support-content-segment-thought-1"]')
      ?.getAttribute('data-full-width')).toBe('true')
    expect(container.querySelector('[data-testid="support-content-segment-thought-1"]')
      ?.getAttribute('data-nested-disclosure')).toBe('true')
    expect(container.querySelector('[data-testid="tool-call-group"]')
      ?.getAttribute('data-full-width')).toBe('true')
    expect(container.querySelector('[data-testid="tool-call-group"]')
      ?.getAttribute('data-nested-disclosure')).toBe('true')

    await act(async () => trigger?.click())
    expect(trigger?.getAttribute('aria-expanded')).toBe('true')
    expect(container.querySelector('[data-testid="completed-work-panel"]')?.getAttribute('data-state'))
      .toBe('expanded')
  })
})

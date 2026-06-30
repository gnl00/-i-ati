// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TOOL_CALL_REASON_PARAMETER_NAME } from '@shared/tools/definitions-utils'

vi.mock('framer-motion', async () => {
  const React = await import('react')

  const passthrough = (tag: string) => (
    React.forwardRef<HTMLElement, Record<string, unknown> & { children?: React.ReactNode }>(({
      children,
      animate: _animate,
      initial: _initial,
      layout: _layout,
      transition: _transition,
      ...props
    }, ref) => React.createElement(tag, { ...props, ref } as any, children as React.ReactNode))
  )

  return {
    motion: {
      div: passthrough('div'),
      span: passthrough('span')
    },
    useReducedMotion: () => false
  }
})

import { ToolCallResult } from '../toolcall/ToolCallResult'

const createToolCallSegment = (
  status: string,
  cost?: number,
  args: Record<string, unknown> = { query: 'latest status' },
  timestamp: number = Date.now(),
  executionStartedAt?: number
): ToolCallSegment => ({
  type: 'toolCall',
  segmentId: 'committed:step-1:tool:tool-1',
  name: 'search',
  content: {
    toolName: 'search',
    args,
    status
  },
  isError: false,
  timestamp,
  toolCallId: 'tool-1',
  toolCallIndex: 0,
  ...(typeof executionStartedAt === 'number' ? { executionStartedAt } : {}),
  ...(typeof cost === 'number' ? { cost } : {})
})

const createWebSearchToolCallSegment = (): ToolCallSegment => ({
  type: 'toolCall',
  segmentId: 'committed:step-1:tool:tool-web',
  name: 'web_search',
  content: {
    toolName: 'web_search',
    args: { query: 'desktop app jitter' },
    status: 'completed',
    result: {
      results: [
        {
          query: 'desktop app jitter',
          success: true,
          link: 'https://example.com/jitter',
          title: 'Virtuoso row jitter',
          snippet: 'Portal details keep virtualized rows stable.',
          content: 'Portal details keep virtualized rows stable.'
        },
        {
          query: 'desktop app jitter',
          success: true,
          link: 'https://example.com/scroll',
          title: 'Trackpad scroll patterns',
          snippet: 'Horizontal wheel intent moves compact carousels.',
          content: 'Horizontal wheel intent moves compact carousels.'
        },
        {
          query: 'desktop app jitter',
          success: true,
          link: 'https://example.com/native',
          title: 'Native desktop affordances',
          snippet: 'Small controls stay stable during repeated use.',
          content: 'Small controls stay stable during repeated use.'
        },
        {
          query: 'desktop app jitter',
          success: true,
          link: 'https://example.com/cards',
          title: 'Card rail navigation',
          snippet: 'Card rails should support buttons and direct scroll.',
          content: 'Card rails should support buttons and direct scroll.'
        }
      ]
    }
  },
  isError: false,
  timestamp: 1,
  toolCallId: 'tool-web',
  toolCallIndex: 0,
  cost: 420
})

const createSubagentToolCallSegment = (): ToolCallSegment => ({
  type: 'toolCall',
  segmentId: 'committed:step-1:tool:tool-subagent',
  name: 'subagent_spawn',
  content: {
    toolName: 'subagent_spawn',
    args: { task: 'inspect portal rendering' },
    status: 'completed',
    result: {
      subagent: {
        id: 'subagent-1',
        role: 'reviewer',
        task: 'inspect portal rendering',
        status: 'completed',
        summary: 'Portal panel rendered.',
        artifacts: {
          tools_used: ['rg'],
          files_touched: ['ToolCallResult.tsx']
        },
        started_at: 1000,
        finished_at: 2600
      }
    }
  },
  isError: false,
  timestamp: 1,
  toolCallId: 'tool-subagent',
  toolCallIndex: 0,
  cost: 1600
})

const createWikiToolCallSegment = (
  name: 'wiki_list' | 'wiki_read' | 'wiki_write' | 'wiki_delete' | 'wiki_search',
  result: Record<string, unknown>,
  args: Record<string, unknown> = {}
): ToolCallSegment => ({
  type: 'toolCall',
  segmentId: `committed:step-1:tool:tool-${name}`,
  name,
  content: {
    toolName: name,
    args,
    status: 'completed',
    result
  },
  isError: false,
  timestamp: 1,
  toolCallId: `tool-${name}`,
  toolCallIndex: 0,
  cost: 320
})

const createRunningWikiToolCallSegment = (
  name: 'wiki_list' | 'wiki_read' | 'wiki_write' | 'wiki_delete' | 'wiki_search',
  args: Record<string, unknown> = {}
): ToolCallSegment => ({
  type: 'toolCall',
  segmentId: `committed:step-1:tool:tool-${name}-running`,
  name,
  content: {
    toolName: name,
    args,
    status: 'running'
  },
  isError: false,
  timestamp: 1,
  toolCallId: `tool-${name}-running`,
  toolCallIndex: 0
})

function getTrigger(container: HTMLElement, name = 'search'): HTMLButtonElement {
  const trigger = container.querySelector<HTMLButtonElement>(`button[aria-label="Inspect ${name} tool call"]`)
  expect(trigger).toBeTruthy()
  return trigger as HTMLButtonElement
}

async function openToolCall(container: HTMLElement, name = 'search') {
  const trigger = getTrigger(container, name)
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function getWebSearchRail(): HTMLElement {
  const rail = document.body.querySelector<HTMLElement>('[data-testid="web-search-results-rail"]')
  expect(rail).toBeTruthy()
  return rail as HTMLElement
}

function getWebSearchRailViewport(): HTMLDivElement {
  const viewport = getWebSearchRail().firstElementChild
  expect(viewport).toBeTruthy()
  return viewport as HTMLDivElement
}

function setRailMetrics(
  rail: HTMLDivElement,
  metrics: { clientWidth: number; scrollWidth: number; scrollLeft?: number }
) {
  Object.defineProperty(rail, 'clientWidth', {
    configurable: true,
    value: metrics.clientWidth
  })
  Object.defineProperty(rail, 'scrollWidth', {
    configurable: true,
    value: metrics.scrollWidth
  })
  rail.scrollLeft = metrics.scrollLeft ?? 0
}

function createWheelEvent({
  deltaX,
  deltaY,
  shiftKey = false
}: {
  deltaX: number
  deltaY: number
  shiftKey?: boolean
}): WheelEvent {
  const event = new Event('wheel', {
    bubbles: true,
    cancelable: true
  }) as WheelEvent

  Object.defineProperties(event, {
    deltaX: {
      configurable: true,
      value: deltaX
    },
    deltaY: {
      configurable: true,
      value: deltaY
    },
    shiftKey: {
      configurable: true,
      value: shiftKey
    }
  })

  return event
}

describe('ToolCallResult cost display', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
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
    vi.useRealTimers()
  })

  it('increments while running and settles on the final cost', async () => {
    await act(async () => {
      root.render(<ToolCallResult toolCall={createToolCallSegment('running')} index={0} />)
    })

    expect(container.textContent).toContain('0.000s')

    await act(async () => {
      vi.advanceTimersByTime(1000)
    })

    expect(container.textContent).toContain('1.000s')

    await act(async () => {
      root.render(<ToolCallResult toolCall={createToolCallSegment('completed', 1680)} index={0} />)
    })

    await act(async () => {
      vi.advanceTimersByTime(400)
    })

    expect(container.textContent).toContain('1.680s')
  })

  it('uses the segment timestamp as the running elapsed anchor', async () => {
    await act(async () => {
      root.render(
        <ToolCallResult
          toolCall={createToolCallSegment(
            'running',
            undefined,
            { query: 'latest status' },
            Date.now() - 2500
          )}
          index={0}
        />
      )
    })

    expect(container.textContent).toContain('2.500s')

    await act(async () => {
      vi.advanceTimersByTime(1000)
    })

    expect(container.textContent).toContain('3.500s')
  })

  it('uses executionStartedAt as the running elapsed anchor when present', async () => {
    await act(async () => {
      root.render(
        <ToolCallResult
          toolCall={createToolCallSegment(
            'running',
            undefined,
            { query: 'latest status' },
            Date.now() - 10000,
            Date.now() - 1200
          )}
          index={0}
        />
      )
    })

    expect(container.textContent).toContain('1.200s')

    await act(async () => {
      vi.advanceTimersByTime(1000)
    })

    expect(container.textContent).toContain('2.200s')
  })

  it('keeps tool_call_reason out of the summary parameters', async () => {
    await act(async () => {
      root.render(
        <ToolCallResult
          toolCall={createToolCallSegment('completed', 1680, {
            query: 'latest status',
            [TOOL_CALL_REASON_PARAMETER_NAME]: 'Explain why search is needed before fetching live data.'
          })}
          index={0}
        />
      )
    })

    await openToolCall(container)

    expect(document.body.textContent).toContain('latest status')
    expect(document.body.textContent).not.toContain(TOOL_CALL_REASON_PARAMETER_NAME)
    expect(document.body.textContent).not.toContain('Explain why search is needed')
    expect(container.textContent).not.toContain('latest status')
  })

  it('hides streaming pending parameters until the tool call args are ready', async () => {
    await act(async () => {
      root.render(
        <ToolCallResult
          toolCall={createToolCallSegment('pending', undefined, {
            query: 'latest status',
            content: 'large streaming payload'
          })}
          index={0}
        />
      )
    })

    await openToolCall(container)

    expect(document.body.textContent).toContain('Preparing tool call parameters')
    expect(document.body.textContent).not.toContain('large streaming payload')
    expect(container.textContent).not.toContain('latest status')
  })

  it('shows parameters after the tool call starts running', async () => {
    await act(async () => {
      root.render(
        <ToolCallResult
          toolCall={createToolCallSegment('running', undefined, {
            query: 'latest status',
            content: 'ready payload'
          })}
          index={0}
        />
      )
    })

    await openToolCall(container)

    expect(document.body.textContent).toContain('latest status')
    expect(document.body.textContent).toContain('ready payload')
    expect(container.textContent).not.toContain('ready payload')
  })

  it('lets the detail code viewer fill its viewport', async () => {
    await act(async () => {
      root.render(<ToolCallResult toolCall={createToolCallSegment('completed', 1680)} index={0} />)
    })

    await openToolCall(container)

    const detailButton = Array.from(document.body.querySelectorAll('button'))
      .find((button) => button.textContent === 'Detail')
    await act(async () => {
      detailButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const codeViewer = document.body.querySelector('.shj-lang-json')
    expect(codeViewer?.className).toContain('h-full')
    expect(codeViewer?.className).toContain('min-h-full')
    expect(codeViewer?.className).toContain('overflow-auto')
  })

  it('closes the popout on Escape', async () => {
    await act(async () => {
      root.render(<ToolCallResult toolCall={createToolCallSegment('completed', 1680)} index={0} />)
    })

    await openToolCall(container)
    expect(document.body.textContent).toContain('latest status')

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
    })

    expect(document.body.textContent).not.toContain('latest status')
    expect(container.textContent).toContain('search')
  })

  it('shows web search results in the popout branch', async () => {
    await act(async () => {
      root.render(<ToolCallResult toolCall={createWebSearchToolCallSegment()} index={0} />)
    })

    await openToolCall(container, 'web_search')

    expect(document.body.textContent).toContain('desktop app jitter')
    expect(document.body.textContent).toContain('Virtuoso row jitter')
    expect(getWebSearchRail()).toBeTruthy()
    expect(container.textContent).not.toContain('Virtuoso row jitter')
  })

  it('moves web search result cards with arrow navigation', async () => {
    await act(async () => {
      root.render(<ToolCallResult toolCall={createWebSearchToolCallSegment()} index={0} />)
    })

    await openToolCall(container, 'web_search')

    const rail = getWebSearchRailViewport()
    const scrollByMock = vi.fn(function (this: HTMLDivElement, options: ScrollToOptions) {
      const left = typeof options.left === 'number' ? options.left : 0
      this.scrollLeft += left
      this.dispatchEvent(new Event('scroll', { bubbles: true }))
    })
    Object.defineProperty(rail, 'scrollBy', {
      configurable: true,
      value: scrollByMock
    })
    setRailMetrics(rail, {
      clientWidth: 500,
      scrollWidth: 1400
    })

    await act(async () => {
      rail.dispatchEvent(new Event('scroll', { bubbles: true }))
    })

    const nextButton = document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="Scroll web search results right"]'
    )
    const previousButton = document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="Scroll web search results left"]'
    )
    expect(nextButton).toBeTruthy()
    expect(previousButton).toBeTruthy()

    await act(async () => {
      nextButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(scrollByMock).toHaveBeenCalledWith({
      left: 360,
      behavior: 'smooth'
    })
    expect(rail.scrollLeft).toBe(360)

    setRailMetrics(rail, {
      clientWidth: 500,
      scrollWidth: 1400,
      scrollLeft: 360
    })

    await act(async () => {
      rail.dispatchEvent(new Event('scroll', { bubbles: true }))
    })

    await act(async () => {
      previousButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(scrollByMock).toHaveBeenLastCalledWith({
      left: -360,
      behavior: 'smooth'
    })
  })

  it('maps Shift+wheel to native rail scroll while preserving vertical wheel flow', async () => {
    await act(async () => {
      root.render(<ToolCallResult toolCall={createWebSearchToolCallSegment()} index={0} />)
    })

    await openToolCall(container, 'web_search')

    const rail = getWebSearchRailViewport()
    setRailMetrics(rail, {
      clientWidth: 500,
      scrollWidth: 1400
    })

    await act(async () => {
      rail.dispatchEvent(new Event('scroll', { bubbles: true }))
    })

    const verticalWheel = createWheelEvent({
      deltaX: 2,
      deltaY: 80
    })

    await act(async () => {
      rail.dispatchEvent(verticalWheel)
    })

    expect(verticalWheel.defaultPrevented).toBe(false)
    expect(rail.scrollLeft).toBe(0)

    const shiftWheel = createWheelEvent({
      deltaX: 0,
      deltaY: 80,
      shiftKey: true
    })

    await act(async () => {
      rail.dispatchEvent(shiftWheel)
    })

    expect(rail.scrollLeft).toBe(80)
  })

  it('lets native horizontal wheel pass through the rail', async () => {
    await act(async () => {
      root.render(<ToolCallResult toolCall={createWebSearchToolCallSegment()} index={0} />)
    })

    await openToolCall(container, 'web_search')

    const rail = getWebSearchRailViewport()
    const horizontalWheel = createWheelEvent({
      deltaX: 56,
      deltaY: 3
    })

    await act(async () => {
      rail.dispatchEvent(horizontalWheel)
    })

    expect(horizontalWheel.defaultPrevented).toBe(false)
    expect(rail.scrollLeft).toBe(0)
  })

  it('shows subagent results in the popout branch', async () => {
    await act(async () => {
      root.render(<ToolCallResult toolCall={createSubagentToolCallSegment()} index={0} />)
    })

    await openToolCall(container, 'subagent_spawn')

    expect(document.body.textContent).toContain('Reviewer')
    expect(document.body.textContent).toContain('inspect portal rendering')
    expect(document.body.textContent).toContain('Portal panel rendered.')
    expect(container.textContent).not.toContain('Portal panel rendered.')
  })

  it('shows wiki search results in the summary branch', async () => {
    await act(async () => {
      root.render(
        <ToolCallResult
          toolCall={createWikiToolCallSegment('wiki_search', {
            success: true,
            query: 'distributed lock',
            total_hits: 2,
            index_status: 'fresh',
            index_message: 'Wiki index is fresh.',
            results: [
              {
                entry_name: 'distributed-lock',
                title: 'Distributed Lock Guide',
                summary: 'Use Redis SET NX with expirations.',
                text: 'Use Redis SET NX with expirations.',
                score: 0.92,
                similarity: 0.81,
                match_source: 'hybrid',
                match_reason: 'Vector chunk match; README title match'
              },
              {
                entry_name: 'lock-runbook',
                title: 'Lock Runbook',
                summary: 'Operational lock notes.',
                text: 'Operational lock notes.',
                score: 0.64,
                similarity: 0.59,
                match_source: 'readme',
                match_reason: 'README summary match'
              }
            ]
          }, { query: 'distributed lock' })}
          index={0}
        />
      )
    })

    await openToolCall(container, 'wiki_search')

    expect(document.body.textContent).toContain('2 hits')
    expect(document.body.textContent).toContain('Distributed Lock Guide')
    expect(document.body.textContent).toContain('hybrid')
    expect(document.body.textContent).toContain('Vector chunk match')
    expect(document.body.textContent).toContain('fresh')
    expect(container.textContent).not.toContain('Distributed Lock Guide')
  })

  it('shows wiki list summaries from result payloads', async () => {
    await act(async () => {
      root.render(
        <ToolCallResult
          toolCall={createWikiToolCallSegment('wiki_list', {
            success: true,
            entries: [
              {
                name: 'release-plan',
                title: 'Release Plan',
                summary: 'Ship the wiki result summary.',
                type: 'note',
                tags: [],
                created: '2026-06-29',
                updated: '2026-06-29',
                source: 'user'
              }
            ]
          })}
          index={0}
        />
      )
    })

    await openToolCall(container, 'wiki_list')

    expect(document.body.textContent).toContain('1 entry')
    expect(document.body.textContent).toContain('Release Plan')
    expect(document.body.textContent).toContain('Ship the wiki result summary.')
  })

  it('shows wiki read summaries from result payloads', async () => {
    await act(async () => {
      root.render(
        <ToolCallResult
          toolCall={createWikiToolCallSegment('wiki_read', {
            success: true,
            name: 'release-plan',
            title: 'Release Plan',
            content: '# Release Plan\n\nShip wiki summaries with complete JSON detail.'
          })}
          index={0}
        />
      )
    })

    await openToolCall(container, 'wiki_read')

    expect(document.body.textContent).toContain('Release Plan')
    expect(document.body.textContent).toContain('Ship wiki summaries with complete JSON detail.')
  })

  it('shows running wiki write parameters until a result payload exists', async () => {
    await act(async () => {
      root.render(
        <ToolCallResult
          toolCall={createRunningWikiToolCallSegment('wiki_write', {
            name: 'release-plan',
            content: 'Draft wiki body.'
          })}
          index={0}
        />
      )
    })

    await openToolCall(container, 'wiki_write')

    expect(document.body.textContent).toContain('release-plan')
    expect(document.body.textContent).toContain('Draft wiki body.')
    expect(document.body.textContent).not.toContain('Failed')
    expect(document.body.textContent).not.toContain('unknown')
  })

  it('shows running wiki search parameters until a result payload exists', async () => {
    await act(async () => {
      root.render(
        <ToolCallResult
          toolCall={createRunningWikiToolCallSegment('wiki_search', {
            query: 'distributed lock',
            localized_query: '分布式锁'
          })}
          index={0}
        />
      )
    })

    await openToolCall(container, 'wiki_search')

    expect(document.body.textContent).toContain('distributed lock')
    expect(document.body.textContent).toContain('分布式锁')
    expect(document.body.textContent).not.toContain('No wiki results')
  })

  it('shows wiki write mutation summaries with index status', async () => {
    await act(async () => {
      root.render(
        <ToolCallResult
          toolCall={createWikiToolCallSegment('wiki_write', {
            success: true,
            name: 'release-plan',
            title: 'Release Plan',
            message: 'Updated wiki entry "Release Plan".',
            index_status: 'queued',
            index_message: 'Wiki index refresh queued.'
          })}
          index={0}
        />
      )
    })

    await openToolCall(container, 'wiki_write')

    expect(document.body.textContent).toContain('Succeeded')
    expect(document.body.textContent).toContain('Release Plan')
    expect(document.body.textContent).toContain('queued')
    expect(document.body.textContent).toContain('Wiki index refresh queued.')
  })

  it('shows wiki delete mutation summaries with index status', async () => {
    await act(async () => {
      root.render(
        <ToolCallResult
          toolCall={createWikiToolCallSegment('wiki_delete', {
            success: false,
            name: 'release-plan',
            message: 'Wiki entry "release-plan" not found.',
            index_status: 'unknown',
            index_message: 'Wiki index unchanged.'
          })}
          index={0}
        />
      )
    })

    await openToolCall(container, 'wiki_delete')

    expect(document.body.textContent).toContain('Failed')
    expect(document.body.textContent).toContain('release-plan')
    expect(document.body.textContent).toContain('Wiki index unchanged.')
  })
})

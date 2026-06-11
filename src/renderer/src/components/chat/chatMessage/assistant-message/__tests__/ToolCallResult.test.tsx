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
  args: Record<string, unknown> = { query: 'latest status' }
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
  timestamp: 1,
  toolCallId: 'tool-1',
  toolCallIndex: 0,
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
})

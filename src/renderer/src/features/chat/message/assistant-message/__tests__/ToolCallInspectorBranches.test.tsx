// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('framer-motion', async () => {
  const React = await import('react')
  return {
    motion: {
      div: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
        ({ children, ...props }, ref) => <div {...props} ref={ref}>{children}</div>
      ),
      span: React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
        ({ children, ...props }, ref) => <span {...props} ref={ref}>{children}</span>
      )
    },
    useReducedMotion: () => false
  }
})

import { ToolCallInspectorDetails } from '../toolcall/ToolCallResult'

const createToolCall = (
  name: string,
  status: string,
  args: Record<string, unknown>,
  result?: unknown
): ToolCallSegment => ({
  type: 'toolCall',
  segmentId: `segment-${name}`,
  toolCallId: `tool-${name}`,
  name,
  timestamp: 1,
  cost: status === 'running' || status === 'pending' ? undefined : 24,
  content: {
    toolName: name,
    args,
    status,
    ...(result === undefined ? {} : { result })
  }
})

const createWheelEvent = ({
  deltaX,
  deltaY,
  shiftKey = false
}: {
  deltaX: number
  deltaY: number
  shiftKey?: boolean
}): WheelEvent => {
  const event = new Event('wheel', {
    bubbles: true,
    cancelable: true
  }) as WheelEvent

  Object.defineProperties(event, {
    deltaX: { configurable: true, value: deltaX },
    deltaY: { configurable: true, value: deltaY },
    shiftKey: { configurable: true, value: shiftKey }
  })

  return event
}

describe('ToolCallInspectorDetails result renderers', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  const renderTool = async (toolCall: ToolCallSegment) => {
    await act(async () => {
      root.render(
        <ToolCallInspectorDetails
          toolCall={toolCall}
          toolResponse={toolCall.content}
        />
      )
    })
  }

  it('keeps pending args hidden and shows running args', async () => {
    await renderTool(createToolCall('exec', 'pending', {
      command: 'pnpm test',
      payload: 'streaming argument'
    }))
    expect(container.textContent).toContain('Preparing parameters')
    expect(container.textContent).not.toContain('streaming argument')

    await renderTool(createToolCall('exec', 'running', {
      command: 'pnpm test',
      payload: 'ready argument'
    }))
    expect(container.textContent).toContain('pnpm test')
    expect(container.textContent).toContain('ready argument')
  })

  it('renders web search cards and exposes the full raw payload', async () => {
    await renderTool(createToolCall('web_search', 'completed', {
      query: 'renderer architecture'
    }, {
      results: Array.from({ length: 4 }, (_, index) => ({
        query: 'renderer architecture',
        success: true,
        link: `https://example.com/renderer-${index}`,
        title: index === 0 ? 'Renderer boundaries' : `Renderer reference ${index}`,
        snippet: 'Feature imports use public indexes.',
        content: 'Feature imports use public indexes.'
      }))
    }))

    expect(container.querySelector('[data-testid="web-search-results-rail"]')).toBeTruthy()
    expect(container.textContent).toContain('Renderer boundaries')
    expect(container.textContent).toContain('Formatted')
    expect(container.textContent).toContain('Raw')
    const rail = container.querySelector<HTMLDivElement>('[data-testid="web-search-results-rail"]')?.firstElementChild as HTMLDivElement
    Object.defineProperty(rail, 'clientWidth', { configurable: true, value: 400 })
    Object.defineProperty(rail, 'scrollWidth', { configurable: true, value: 1000 })
    const scrollBy = vi.fn()
    Object.defineProperty(rail, 'scrollBy', { configurable: true, value: scrollBy })
    await act(async () => rail.dispatchEvent(new Event('scroll', { bubbles: true })))
    const next = container.querySelector<HTMLButtonElement>('button[aria-label="Scroll web search results right"]')
    await act(async () => next?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(scrollBy).toHaveBeenCalledWith({ left: 288, behavior: 'smooth' })

    const raw = Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Raw')
    await act(async () => raw?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(container.querySelector('[data-testid="web-search-results-rail"]')).toBeNull()
    expect(container.textContent).toContain('Feature imports use public indexes.')
  })

  it('maps Shift+wheel to the web result rail and preserves vertical wheel flow', async () => {
    await renderTool(createToolCall('web_search', 'completed', {}, {
      results: Array.from({ length: 4 }, (_, index) => ({
        query: 'renderer architecture',
        success: true,
        link: `https://example.com/renderer-${index}`,
        title: `Renderer reference ${index}`,
        snippet: 'Feature imports use public indexes.',
        content: 'Feature imports use public indexes.'
      }))
    }))

    const rail = container.querySelector<HTMLDivElement>(
      '[data-testid="web-search-results-rail"]'
    )?.firstElementChild as HTMLDivElement
    Object.defineProperty(rail, 'clientWidth', { configurable: true, value: 500 })
    Object.defineProperty(rail, 'scrollWidth', { configurable: true, value: 1400 })
    rail.scrollLeft = 0

    await act(async () => {
      rail.dispatchEvent(new Event('scroll', { bubbles: true }))
    })

    const verticalWheel = createWheelEvent({ deltaX: 2, deltaY: 80 })
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

  it('lets native horizontal wheel pass through the web result rail', async () => {
    await renderTool(createToolCall('web_search', 'completed', {}, {
      results: [{
        query: 'renderer architecture',
        success: true,
        link: 'https://example.com/renderer',
        title: 'Renderer reference',
        snippet: 'Feature imports use public indexes.',
        content: 'Feature imports use public indexes.'
      }]
    }))

    const rail = container.querySelector<HTMLDivElement>(
      '[data-testid="web-search-results-rail"]'
    )?.firstElementChild as HTMLDivElement
    const horizontalWheel = createWheelEvent({ deltaX: 56, deltaY: 3 })

    await act(async () => {
      rail.dispatchEvent(horizontalWheel)
    })

    expect(horizontalWheel.defaultPrevented).toBe(false)
    expect(rail.scrollLeft).toBe(0)
  })

  it('renders subagent results and exposes the full raw payload', async () => {
    await renderTool(createToolCall('subagent', 'completed', {
      action: 'spawn',
      task: 'Review inspector'
    }, {
      subagent: {
        id: 'agent-1',
        role: 'reviewer',
        task: 'Review inspector',
        status: 'completed',
        summary: 'Inspector reviewed.',
        started_at: 10,
        finished_at: 20
      }
    }))

    expect(container.textContent).toContain('Reviewer')
    expect(container.textContent).toContain('Inspector reviewed.')
    expect(container.textContent).toContain('Formatted')
    expect(container.textContent).toContain('Raw')
    const raw = Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Raw')
    await act(async () => raw?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(container.textContent).toContain('agent-1')
  })

  it.each([
    {
      action: 'list',
      result: { entries: [{ name: 'release-plan', title: 'Release Plan', summary: 'Ship inspector.' }] },
      expected: ['1 entry', 'Release Plan']
    },
    {
      action: 'read',
      result: { name: 'release-plan', title: 'Release Plan', content: 'Ship the inspector.' },
      expected: ['Release Plan', 'Ship the inspector.']
    },
    {
      action: 'search',
      result: {
        query: 'inspector',
        total_hits: 1,
        results: [{ entry_name: 'tool-inspector', title: 'Tool Inspector', match_source: 'hybrid' }]
      },
      expected: ['1 hit', 'Tool Inspector', 'hybrid']
    },
    {
      action: 'write',
      result: { success: true, name: 'release-plan', title: 'Release Plan', index_status: 'queued' },
      expected: ['Succeeded', 'Release Plan', 'queued']
    },
    {
      action: 'delete',
      result: { success: false, name: 'release-plan', message: 'Entry missing.' },
      expected: ['Failed', 'release-plan', 'Entry missing.']
    }
  ])('renders the $action specialized summary', async ({ action, result, expected }) => {
    await renderTool(createToolCall('wiki', 'completed', { action }, result))
    for (const text of expected) expect(container.textContent).toContain(text)

    const raw = Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Raw')
    expect(raw).toBeTruthy()
    await act(async () => raw?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(container.querySelector('[data-testid="wiki-tool-summary"]')).toBeNull()
  })

  it('parses the wiki action from JSON arguments', async () => {
    const toolCall = createToolCall('wiki', 'completed', {}, {
      name: 'release-plan',
      title: 'Release Plan',
      content: 'Ship the inspector.'
    })
    toolCall.content = {
      ...toolCall.content,
      args: JSON.stringify({ action: 'read', name: 'release-plan' })
    }

    await renderTool(toolCall)
    expect(container.textContent).toContain('Release Plan')
    expect(container.textContent).toContain('Ship the inspector.')
  })
})

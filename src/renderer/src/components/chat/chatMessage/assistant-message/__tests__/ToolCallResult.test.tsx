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
    expect(container.textContent).not.toContain('Virtuoso row jitter')
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

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

    const trigger = container.querySelector('button')
    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('latest status')
    expect(container.textContent).not.toContain(TOOL_CALL_REASON_PARAMETER_NAME)
    expect(container.textContent).not.toContain('Explain why search is needed')
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

    const trigger = container.querySelector('button')
    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('Preparing tool call parameters')
    expect(container.textContent).not.toContain('latest status')
    expect(container.textContent).not.toContain('large streaming payload')
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

    const trigger = container.querySelector('button')
    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('latest status')
    expect(container.textContent).toContain('ready payload')
  })
})

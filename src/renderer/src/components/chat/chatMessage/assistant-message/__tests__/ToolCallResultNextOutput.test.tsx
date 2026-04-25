// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

import { ToolCallResultNextOutput } from '../toolcall/ToolCallResultNextOutput'

const createToolCallSegment = (status: string, cost?: number): ToolCallSegment => ({
  type: 'toolCall',
  segmentId: 'committed:step-1:tool:tool-1',
  name: 'search',
  content: {
    toolName: 'search',
    args: { query: 'latest status' },
    status
  },
  isError: false,
  timestamp: 1,
  toolCallId: 'tool-1',
  toolCallIndex: 0,
  ...(typeof cost === 'number' ? { cost } : {})
})

describe('ToolCallResultNextOutput cost display', () => {
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
      root.render(<ToolCallResultNextOutput toolCall={createToolCallSegment('running')} index={0} />)
    })

    expect(container.textContent).toContain('0.000s')

    await act(async () => {
      vi.advanceTimersByTime(1000)
    })

    expect(container.textContent).toContain('1.000s')

    await act(async () => {
      root.render(<ToolCallResultNextOutput toolCall={createToolCallSegment('completed', 1680)} index={0} />)
    })

    await act(async () => {
      vi.advanceTimersByTime(400)
    })

    expect(container.textContent).toContain('1.680s')
  })
})

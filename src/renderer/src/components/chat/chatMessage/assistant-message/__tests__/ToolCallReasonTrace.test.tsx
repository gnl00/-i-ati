// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { ToolCallReasonTrace } from '../model-badge/ToolCallReasonTrace'
import type { ToolCallReasonItem } from '../model/toolCallReason'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined
let container: HTMLDivElement | undefined

const reasonItems: ToolCallReasonItem[] = [
  {
    id: 'tool-1',
    toolName: 'read',
    reason: 'Read first.',
    order: 0,
    isTerminal: true
  },
  {
    id: 'tool-2',
    toolName: 'search',
    reason: 'Search second.',
    order: 1,
    isTerminal: false
  },
  {
    id: 'tool-3',
    toolName: 'shell',
    reason: 'Typecheck last.',
    order: 2,
    isTerminal: false
  }
]

function renderTrace(activeItem?: ToolCallReasonItem) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  act(() => {
    root?.render(<ToolCallReasonTrace items={reasonItems} activeItem={activeItem} />)
  })

  return container
}

function getReasonElement(reason: string): HTMLElement {
  const element = container?.querySelector(`[title="${reason}"]`)
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing reason element: ${reason}`)
  }
  return element
}

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  container?.remove()
  root = undefined
  container = undefined
})

describe('ToolCallReasonTrace', () => {
  it('highlights the active pending reason instead of the newest pending reason', () => {
    renderTrace(reasonItems[1])

    expect(getReasonElement('Search second.').className).toContain('border-amber-200/55')
    expect(getReasonElement('Typecheck last.').className).toContain('border-slate-200/72')
  })

  it('falls back to the earliest pending reason when no active item is provided', () => {
    renderTrace()

    expect(getReasonElement('Search second.').className).toContain('border-amber-200/55')
    expect(getReasonElement('Typecheck last.').className).toContain('border-slate-200/72')
  })

  it('keeps valid calc spacing in the overflow mask class', () => {
    renderTrace(reasonItems[1])

    expect(container?.firstElementChild?.className).toContain('black_calc(100%_-_18px)')
  })
})

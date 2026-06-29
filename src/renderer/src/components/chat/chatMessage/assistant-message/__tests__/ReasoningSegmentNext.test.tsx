// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn()
  }
}))

import { ReasoningSegmentNext } from '../segments/ReasoningSegmentNext'

const BASE_TIME = new Date('2026-06-26T00:00:00.000Z')

const createReasoningSegment = (overrides: Partial<ReasoningSegment> = {}): ReasoningSegment => ({
  type: 'reasoning',
  segmentId: 'committed:step-1:reasoning:0',
  content: 'Complete thought body\n\n- inspect current code\n- preserve the trigger',
  timestamp: BASE_TIME.getTime(),
  ...overrides
})

function getTrigger(container: HTMLElement): HTMLButtonElement {
  const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Inspect thought process"]')
  expect(trigger).toBeTruthy()
  return trigger as HTMLButtonElement
}

function getPanel(): HTMLElement {
  const panel = document.body.querySelector<HTMLElement>('[data-testid="reasoning-thought-popout"]')
  expect(panel).toBeTruthy()
  return panel as HTMLElement
}

async function openReasoning(container: HTMLElement) {
  const trigger = getTrigger(container)
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('ReasoningSegmentNext', () => {
  let container: HTMLDivElement
  let root: Root
  let writeText: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(BASE_TIME)
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

    writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText
      }
    })

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

  it('renders the thought body in the document portal after click', async () => {
    await act(async () => {
      root.render(<ReasoningSegmentNext segment={createReasoningSegment()} />)
    })

    expect(container.textContent).toContain('Thought')
    expect(container.textContent).not.toContain('inspect current code')

    await openReasoning(container)

    const panel = getPanel()
    expect(document.body.contains(panel)).toBe(true)
    expect(container.contains(panel)).toBe(false)
    expect(panel.textContent).toContain('inspect current code')
    expect(container.textContent).not.toContain('inspect current code')
  })

  it('closes the popout on Escape', async () => {
    await act(async () => {
      root.render(<ReasoningSegmentNext segment={createReasoningSegment()} />)
    })

    await openReasoning(container)
    expect(getPanel().textContent).toContain('inspect current code')

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
    })

    expect(document.body.querySelector('[data-testid="reasoning-thought-popout"]')).toBeNull()
    expect(container.textContent).toContain('Thought')
  })

  it('updates the streaming duration with fake timers', async () => {
    await act(async () => {
      root.render(
        <ReasoningSegmentNext
          segment={createReasoningSegment({
            timestamp: Date.now()
          })}
          isStreaming={true}
        />
      )
    })

    expect(container.textContent).toContain('1s')

    await act(async () => {
      vi.advanceTimersByTime(1250)
    })

    expect(container.textContent).toContain('2s')
  })

  it('uses endedAt as a fixed duration', async () => {
    const timestamp = Date.now()

    await act(async () => {
      root.render(
        <ReasoningSegmentNext
          segment={createReasoningSegment({
            timestamp,
            endedAt: timestamp + 1600
          })}
          isStreaming={true}
        />
      )
    })

    expect(container.textContent).toContain('2s')

    await act(async () => {
      vi.advanceTimersByTime(5000)
    })

    expect(container.textContent).toContain('2s')
  })

  it('copies the complete original content', async () => {
    const content = 'Complete original thought\n```ts\nconst value = 1'

    await act(async () => {
      root.render(<ReasoningSegmentNext segment={createReasoningSegment({ content })} />)
    })

    await openReasoning(container)

    const copyButton = document.body.querySelector<HTMLButtonElement>('button[aria-label="Copy thought"]')
    expect(copyButton).toBeTruthy()

    await act(async () => {
      copyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(writeText).toHaveBeenCalledWith(content)
  })
})

// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/explicit-function-return-type */

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UserMessage } from '../index'

const { scrollToMessage } = vi.hoisted(() => ({ scrollToMessage: vi.fn() }))

vi.mock('@renderer/shared/components/ui/message-scroller', () => ({
  useMessageScroller: () => ({ scrollToMessage })
}))

vi.mock('react-markdown', () => ({
  default: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className} data-testid="mock-markdown">{children}</div>
  )
}))

vi.mock('remark-gfm', () => ({
  default: () => null
}))

vi.mock('remark-math', () => ({
  default: () => null
}))

vi.mock('rehype-katex', () => ({
  default: () => null
}))

vi.mock('@renderer/shared/lib/styleLoaders', () => ({
  loadKatexStyles: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../../message-operations', () => ({
  MessageOperations: () => <div data-testid="message-operations" />
}))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

class ResizeObserverMock {
  private static readonly callbacks = new Set<ResizeObserverCallback>()
  private readonly callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    ResizeObserverMock.callbacks.add(callback)
  }

  observe(target: Element): void {
    this.callback([{ target } as ResizeObserverEntry], this)
  }

  disconnect(): void {
    ResizeObserverMock.callbacks.delete(this.callback)
  }

  unobserve(): void {
    return undefined
  }

  static emit(): void {
    for (const callback of ResizeObserverMock.callbacks) {
      callback([], {} as ResizeObserver)
    }
  }

  static reset(): void {
    ResizeObserverMock.callbacks.clear()
  }
}

const shortMessage = 'Short user prompt.'
const longMessage = Array.from({ length: 60 }, (_, index) => `Long prompt line ${index + 1}`).join('\n')

const createUserMessage = (content: string): ChatMessage => ({
  role: 'user',
  content,
  segments: []
})

describe('UserMessage collapse behavior', () => {
  let container: HTMLDivElement
  let root: Root
  let scrollHeightDescriptor: PropertyDescriptor | undefined
  let originalResizeObserver: typeof ResizeObserver | undefined
  let originalRequestAnimationFrame: typeof window.requestAnimationFrame
  let originalCancelAnimationFrame: typeof window.cancelAnimationFrame
  let pendingAnimationFrames: Array<{ id: number; callback: FrameRequestCallback }>
  let nextAnimationFrameId: number
  let scrollHeightReads: number
  let measuredHeight: number

  beforeEach(() => {
    scrollToMessage.mockReset().mockReturnValue(true)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    originalRequestAnimationFrame = window.requestAnimationFrame
    originalCancelAnimationFrame = window.cancelAnimationFrame
    pendingAnimationFrames = []
    nextAnimationFrameId = 0
    window.requestAnimationFrame = callback => {
      const id = ++nextAnimationFrameId
      pendingAnimationFrames.push({ id, callback })
      return id
    }
    window.cancelAnimationFrame = id => {
      pendingAnimationFrames = pendingAnimationFrames.filter(frame => frame.id !== id)
    }
    scrollHeightReads = 0
    measuredHeight = 420

    scrollHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        if (this.getAttribute('data-testid') === 'user-message-collapsible-content') {
          scrollHeightReads += 1
          return (this.textContent?.length ?? 0) > 500 ? measuredHeight : 120
        }

        return 0
      }
    })

    originalResizeObserver = globalThis.ResizeObserver
    globalThis.ResizeObserver = ResizeObserverMock
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()

    if (scrollHeightDescriptor) {
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', scrollHeightDescriptor)
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight')
    }

    ResizeObserverMock.reset()
    globalThis.ResizeObserver = originalResizeObserver as typeof ResizeObserver
    window.requestAnimationFrame = originalRequestAnimationFrame
    window.cancelAnimationFrame = originalCancelAnimationFrame
  })

  const flushAnimationFrames = async () => {
    const frames = pendingAnimationFrames.splice(0)
    await act(async () => {
      for (const frame of frames) {
        frame.callback(performance.now())
      }
    })
  }

  it('keeps short user messages fully visible', async () => {
    await act(async () => {
      root.render(
        <UserMessage
          index={0}
          message={createUserMessage(shortMessage)}
          isLatest={false}
          isHovered={false}
          onHover={() => {}}
          onCopyClick={() => {}}
        />
      )
    })
    await flushAnimationFrames()

    expect(container.querySelector('[data-testid="user-message-expand-button"]')).toBeNull()
    expect(container.querySelector('[data-testid="user-message-collapse-fade"]')).toBeNull()
    expect(container.querySelector<HTMLElement>('[data-testid="user-message-collapsible-content"]')?.style.maxHeight).toBe('')
  })

  it('collapses long user messages by default and toggles expanded content', async () => {
    await act(async () => {
      root.render(
        <UserMessage
          index={0}
          message={createUserMessage(longMessage)}
          isLatest={false}
          isHovered={false}
          onHover={() => {}}
          onCopyClick={() => {}}
        />
      )
    })
    await flushAnimationFrames()

    const content = container.querySelector<HTMLElement>('[data-testid="user-message-collapsible-content"]')
    const expandButton = container.querySelector<HTMLButtonElement>('[data-testid="user-message-expand-button"]')

    expect(content?.dataset.expanded).toBe('false')
    expect(content?.style.maxHeight).toBe('140px')
    expect(container.querySelector('[data-testid="user-message-collapse-fade"]')).not.toBeNull()
    expect(expandButton).not.toBeNull()
    expect(expandButton?.textContent).toBe('Show more')
    expect(expandButton?.getAttribute('aria-expanded')).toBe('false')
    expect(expandButton?.getAttribute('aria-controls')).toBe(content?.id)

    await act(async () => {
      expandButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(content?.dataset.expanded).toBe('true')
    expect(content?.style.maxHeight).toBe('')
    expect(container.querySelector('[data-testid="user-message-expand-button"]')).toBeNull()
    expect(container.querySelector('[data-testid="user-message-collapse-fade"]')).toBeNull()

    const collapseButton = container.querySelector<HTMLButtonElement>('[data-testid="user-message-collapse-button"]')

    expect(collapseButton).not.toBeNull()
    expect(collapseButton?.textContent).toBe('Show less')
    expect(collapseButton?.getAttribute('aria-expanded')).toBe('true')
    expect(collapseButton?.getAttribute('aria-controls')).toBe(content?.id)

    await act(async () => {
      collapseButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(content?.dataset.expanded).toBe('false')
    expect(content?.style.maxHeight).toBe('140px')
    expect(container.querySelector('[data-testid="user-message-expand-button"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="user-message-collapse-fade"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="user-message-collapse-button"]')).toBeNull()
  })

  it.each([
    { itemTop: 80, scrollMargin: 0, shouldScroll: true },
    { itemTop: 110, scrollMargin: 32, shouldScroll: true },
    { itemTop: 132, scrollMargin: 32, shouldScroll: false },
    { itemTop: 160, scrollMargin: 32, shouldScroll: false }
  ])('restores an obscured top on collapse: %j', async ({ itemTop, scrollMargin, shouldScroll }) => {
    await act(async () => {
      root.render(
        <div data-slot="message-scroller-viewport">
          <div data-slot="message-scroller-item" data-message-id="user-42" style={{ scrollMarginBlockStart: `${scrollMargin}px` }}>
            <UserMessage
              index={0}
              message={createUserMessage(longMessage)}
              isLatest={false}
              isHovered={false}
              onHover={() => {}}
              onCopyClick={() => {}}
            />
          </div>
        </div>
      )
    })
    await flushAnimationFrames()

    const viewport = container.querySelector<HTMLElement>('[data-slot="message-scroller-viewport"]')!
    const item = container.querySelector<HTMLElement>('[data-slot="message-scroller-item"]')!
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({ top: 100 } as DOMRect)
    vi.spyOn(item, 'getBoundingClientRect').mockReturnValue({ top: itemTop } as DOMRect)

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="user-message-expand-button"]')?.click()
    })
    expect(scrollToMessage).not.toHaveBeenCalled()

    scrollToMessage.mockImplementation(() => {
      expect(container.querySelector<HTMLElement>('[data-testid="user-message-collapsible-content"]')?.style.maxHeight).toBe('140px')
      return true
    })
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="user-message-collapse-button"]')?.click()
    })

    if (shouldScroll) {
      expect(scrollToMessage).toHaveBeenCalledExactlyOnceWith('user-42', { align: 'start', behavior: 'instant' })
    } else {
      expect(scrollToMessage).not.toHaveBeenCalled()
    }
  })

  it.each([{ height: 164, collapsible: false }, { height: 165, collapsible: true }])(
    'keeps the overflow buffer at height $height',
    async ({ height, collapsible }) => {
      measuredHeight = height
      await act(async () => {
        root.render(
          <UserMessage
            index={0}
            message={createUserMessage(longMessage)}
            isLatest={false}
            isHovered={false}
            onHover={() => {}}
            onCopyClick={() => {}}
          />
        )
      })
      await flushAnimationFrames()

      expect(!!container.querySelector('[data-testid="user-message-expand-button"]')).toBe(collapsible)
      expect(container.querySelector<HTMLElement>('[data-testid="user-message-collapsible-content"]')?.style.maxHeight).toBe(collapsible ? '140px' : '')
    }
  )

  it('defers the first layout measurement to a batched animation frame', async () => {
    await act(async () => {
      root.render(
        <UserMessage
          index={0}
          message={createUserMessage(longMessage)}
          isLatest={false}
          isHovered={false}
          onHover={() => {}}
          onCopyClick={() => {}}
        />
      )
    })

    expect(scrollHeightReads).toBe(0)
    await flushAnimationFrames()
    expect(scrollHeightReads).toBe(1)
    expect(container.querySelector('[data-testid="user-message-expand-button"]')).not.toBeNull()
  })

  it('batches observer updates and cancels a queued measurement on cleanup', async () => {
    await act(async () => {
      root.render(
        <UserMessage
          index={0}
          message={createUserMessage(longMessage)}
          isLatest={false}
          isHovered={false}
          onHover={() => {}}
          onCopyClick={() => {}}
        />
      )
    })
    await flushAnimationFrames()

    measuredHeight = 120
    ResizeObserverMock.emit()
    await flushAnimationFrames()
    expect(container.querySelector('[data-testid="user-message-expand-button"]')).toBeNull()

    const readsBeforeUnmount = scrollHeightReads
    await act(async () => root.render(<div />))
    measuredHeight = 420
    ResizeObserverMock.emit()
    await flushAnimationFrames()
    expect(scrollHeightReads).toBe(readsBeforeUnmount)
  })
})

// @vitest-environment happy-dom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UserMessage } from '../index'

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
  private readonly callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
  }

  observe(target: Element): void {
    this.callback([{ target } as ResizeObserverEntry], this)
  }

  disconnect(): void {}

  unobserve(): void {}
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

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    scrollHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        if (this.getAttribute('data-testid') === 'user-message-collapsible-content') {
          return (this.textContent?.length ?? 0) > 500 ? 420 : 120
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

    globalThis.ResizeObserver = originalResizeObserver as typeof ResizeObserver
  })

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

    const content = container.querySelector<HTMLElement>('[data-testid="user-message-collapsible-content"]')
    const expandButton = container.querySelector<HTMLButtonElement>('[data-testid="user-message-expand-button"]')

    expect(content?.dataset.expanded).toBe('false')
    expect(content?.style.maxHeight).toBe('140px')
    expect(container.querySelector('[data-testid="user-message-collapse-fade"]')).not.toBeNull()
    expect(expandButton).not.toBeNull()

    await act(async () => {
      expandButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(content?.dataset.expanded).toBe('true')
    expect(content?.style.maxHeight).toBe('420px')
    expect(container.querySelector('[data-testid="user-message-expand-button"]')).toBeNull()
    expect(container.querySelector('[data-testid="user-message-collapse-fade"]')).toBeNull()

    const collapseButton = container.querySelector<HTMLButtonElement>('[data-testid="user-message-collapse-button"]')

    expect(collapseButton).not.toBeNull()

    await act(async () => {
      collapseButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(content?.dataset.expanded).toBe('false')
    expect(content?.style.maxHeight).toBe('140px')
    expect(container.querySelector('[data-testid="user-message-expand-button"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="user-message-collapse-fade"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="user-message-collapse-button"]')).toBeNull()
  })
})

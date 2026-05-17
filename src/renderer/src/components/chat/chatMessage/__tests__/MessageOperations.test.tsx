// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MessageOperations } from '../message-operations'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('MessageOperations', () => {
  let root: Root | undefined
  let container: HTMLDivElement | undefined

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount()
      })
    }
    root = undefined
    container?.remove()
    container = undefined
  })

  it('keeps assistant actions and meta hidden until the message is hovered', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(
        <MessageOperations
          type="assistant"
          message={{ createdAt: 1 }}
          tokenUsageDisplay={{
            compactLabel: 'Usage 165.2k',
            tooltipItems: [
              'Total tokens: 165.2k',
              'Input tokens: 164.8k',
              'Output tokens: 0.3k',
              'Cache hit tokens: 88.6k',
              'Cache hit rate: 54%'
            ],
            ariaLabel: 'Total tokens 165.2k, Input tokens 164.8k, Output tokens 0.3k, Cache hit tokens 88.6k, Cache hit rate 54%'
          }}
          isHovered={false}
          showRegenerate
          onCopyClick={vi.fn()}
          onRegenerateClick={vi.fn()}
          onEditClick={vi.fn()}
        />
      )
    })

    expect(container.textContent).not.toContain('Input tokens: 164.8k')

    const actionsGroup = container.querySelector('[data-testid="assistant-message-actions"]')
    const metaGroup = container.querySelector('[data-testid="assistant-message-meta"]')
    expect(actionsGroup?.textContent).toContain('Copy')
    expect(actionsGroup?.textContent).toContain('Regenerate')
    expect(actionsGroup?.textContent).toContain('Edit')
    expect(actionsGroup?.textContent).not.toContain('Usage 165.2k')
    expect(metaGroup?.textContent).toContain('Usage 165.2k')
    expect(metaGroup?.textContent).toContain('1970-01-01 08:00:00')
    expect(actionsGroup?.className).toContain('opacity-0')
    expect(actionsGroup?.className).toContain('pointer-events-none')
    expect(metaGroup?.className).toContain('opacity-0')
    expect(metaGroup?.className).toContain('pointer-events-none')
  })

  it('shows detailed token usage when the usage label is hovered', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(
        <MessageOperations
          type="assistant"
          message={{ createdAt: 1 }}
          tokenUsageDisplay={{
            compactLabel: 'Usage 165.2k',
            tooltipItems: [
              'Total tokens: 165.2k',
              'Input tokens: 164.8k',
              'Output tokens: 0.3k',
              'Cache hit tokens: 88.6k',
              'Cache hit rate: 54%'
            ],
            ariaLabel: 'Total tokens 165.2k, Input tokens 164.8k, Output tokens 0.3k, Cache hit tokens 88.6k, Cache hit rate 54%'
          }}
          isHovered
          showRegenerate
          onCopyClick={vi.fn()}
          onRegenerateClick={vi.fn()}
          onEditClick={vi.fn()}
        />
      )
    })

    expect(container.textContent).toContain('Usage 165.2k')
    expect(container.textContent).not.toContain('Input tokens: 164.8k')

    const actionsGroup = container.querySelector('[data-testid="assistant-message-actions"]')
    const metaGroup = container.querySelector('[data-testid="assistant-message-meta"]')
    expect(actionsGroup?.className).toContain('opacity-100')
    expect(metaGroup?.className).toContain('opacity-100')

    const usageLabel = container.querySelector(
      '[aria-label="Total tokens 165.2k, Input tokens 164.8k, Output tokens 0.3k, Cache hit tokens 88.6k, Cache hit rate 54%"]'
    )
    expect(usageLabel).not.toBeNull()

    act(() => {
      usageLabel?.parentElement?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })

    expect(container.textContent).toContain('Total tokens: 165.2k')
    expect(container.textContent).toContain('Input tokens: 164.8k')
    expect(container.textContent).toContain('Output tokens: 0.3k')
    expect(container.textContent).toContain('Cache hit tokens: 88.6k')
    expect(container.textContent).toContain('Cache hit rate: 54%')
  })
})

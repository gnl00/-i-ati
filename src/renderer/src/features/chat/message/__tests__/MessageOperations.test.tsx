// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CopyButton, MessageOperations } from '../message-operations'

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

  it('exposes the shared copy control with consistent interaction styling', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    const onClick = vi.fn()

    act(() => {
      root?.render(<CopyButton label="Copy result" onClick={onClick} />)
    })

    const button = container.querySelector<HTMLButtonElement>('button[aria-label="Copy result"]')
    expect(button?.type).toBe('button')
    expect(button?.className).toContain('message-operation-button')

    act(() => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onClick).toHaveBeenCalledOnce()
  })

  it('keeps the footer copy treatment and offers a quiet compact treatment', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(
        <>
          <CopyButton label="Copy footer" onClick={vi.fn()} />
          <CopyButton
            variant="compact"
            label="Copy inspector"
            onClick={vi.fn()}
          />
        </>
      )
    })

    const footerButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Copy footer"]'
    )
    const compactButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Copy inspector"]'
    )
    const footerIcon = footerButton?.querySelector('svg')
    const compactIcon = compactButton?.querySelector('svg')

    expect(footerButton?.className).toContain('w-7')
    expect(footerButton?.className).toContain('hover:scale-110')
    expect(footerButton?.className).toContain('backdrop-blur-sm')
    expect(footerButton?.className).toContain('message-operation-button')
    expect(footerIcon?.getAttribute('class')).toContain('w-4')

    expect(compactButton?.className).toContain('h-6')
    expect(compactButton?.className).toContain('w-6')
    expect(compactButton?.className).toContain('transition-all')
    expect(compactButton?.className).toContain('duration-300')
    expect(compactButton?.className).toContain('ease-out')
    expect(compactButton?.className).toContain('hover:bg-black/5')
    expect(compactButton?.className).toContain('hover:scale-110')
    expect(compactButton?.className).toContain('active:scale-95')
    expect(compactButton?.className).not.toContain('backdrop-blur-sm')
    expect(compactButton?.className).not.toContain('message-operation-button')
    expect(compactIcon?.getAttribute('class')).toContain('w-3')
    expect(compactIcon?.parentElement?.className).toContain('group-hover:rotate-12')
    expect(compactIcon?.parentElement?.className).toContain('group-active:rotate-0')
    expect(compactButton?.title).toBe('Copy inspector')

    for (const button of [footerButton, compactButton]) {
      expect(button?.className).toContain('motion-reduce:transition-colors')
      expect(button?.className).toContain('motion-reduce:hover:scale-none')
      expect(button?.className).toContain('motion-reduce:active:scale-none')
    }
    for (const icon of [footerIcon, compactIcon]) {
      expect(icon?.parentElement?.className).toContain('motion-reduce:transition-none')
      expect(icon?.parentElement?.className).toContain('motion-reduce:group-hover:rotate-none')
      expect(icon?.parentElement?.className).toContain('motion-reduce:group-active:rotate-none')
    }
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
    const pad = (value: number) => String(value).padStart(2, '0')
    const createdAtDate = new Date(1)
    const expectedDateLabel = `${createdAtDate.getFullYear()}-${pad(createdAtDate.getMonth() + 1)}-${pad(createdAtDate.getDate())} ${pad(createdAtDate.getHours())}:${pad(createdAtDate.getMinutes())}:${pad(createdAtDate.getSeconds())}`
    expect(metaGroup?.textContent).toContain(expectedDateLabel)
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

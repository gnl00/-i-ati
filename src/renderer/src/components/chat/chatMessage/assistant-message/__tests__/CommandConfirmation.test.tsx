// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandConfirmation } from '../CommandConfirmation'

function getClassNames(container: HTMLElement): string {
  return Array.from(container.querySelectorAll<HTMLElement>('[class]'))
    .map(element => element.className)
    .join(' ')
}

describe('CommandConfirmation', () => {
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
    vi.useRealTimers()
    container.remove()
  })

  it('keeps actions in the header before the scrollable review details', async () => {
    const longReason = 'Risk '.repeat(400)

    await act(async () => {
      root.render(
        <CommandConfirmation
          request={{
            command: `wiki_write --content ${'x'.repeat(1800)}`,
            risk_level: 'risky',
            execution_reason: 'Confirm a long mutation request '.repeat(20),
            possible_risk: longReason
          }}
          onConfirm={() => {}}
          onCancel={() => {}}
        />
      )
      vi.advanceTimersByTime(60)
    })

    const confirmation = container.querySelector('[data-testid="command-confirmation"]')
    const shell = container.querySelector('[data-testid="command-confirmation-shell"]')
    const header = container.querySelector('[data-testid="command-confirmation-header"]')
    const review = container.querySelector('[data-testid="command-confirmation-review"]')
    const actions = container.querySelector('[data-testid="command-confirmation-actions"]')
    const actionsShell = container.querySelector('[data-testid="command-confirmation-actions-shell"]')
    const command = container.querySelector('[data-testid="command-confirmation-command"]')
    const title = header?.querySelector('h3')
    const allClassNames = getClassNames(container)

    expect(confirmation?.className).toContain('max-h-full')
    expect(confirmation?.className).toContain('transition-transform')
    expect(confirmation?.className).toContain('duration-200')
    expect(confirmation?.className).not.toContain('transition-all')
    expect(confirmation?.className).not.toContain('opacity-')
    expect(allClassNames).toContain('backdrop-blur-3xl')
    expect(shell?.className).toContain('bg-black/5')
    expect(shell?.className).toContain('backdrop-blur-3xl')
    expect(shell?.className).toContain('dark:bg-white/5')
    expect(shell?.className).not.toContain('bg-white/52')
    expect(shell?.className).not.toContain('/[')
    expect(shell?.className).not.toContain('/22')
    expect(actionsShell?.className).toContain('bg-white')
    expect(actionsShell?.className).toContain('dark:bg-slate-900')
    expect(actionsShell?.className).toContain('rounded-xl')
    expect(actionsShell?.className).toContain('border')
    expect(actionsShell?.className).not.toContain('bg-white/20')
    expect(actionsShell?.className).not.toContain('dark:bg-slate-900/35')
    expect(header?.className).toContain('grid-cols-[auto_minmax(0,1fr)_auto]')
    expect(header?.contains(title ?? null)).toBe(true)
    expect(header?.contains(actions)).toBe(true)
    expect(header?.compareDocumentPosition(review as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(actions?.className).toContain('shrink-0')
    expect(actions?.className).toContain('self-start')
    expect(actions?.textContent).toContain('Cancel')
    expect(actions?.textContent).toContain('Execute')
    expect(review?.className).toContain('overflow-y-auto')
    expect(review?.className).toContain('overscroll-contain')
    expect(review?.contains(actions)).toBe(false)
    expect(review?.textContent).toContain(longReason.trim())
    expect(review?.textContent).not.toContain('Execute')
    expect(review?.textContent).not.toContain('Cancel')
    expect(command?.className).toContain('max-h-16')
    expect(command?.className).toContain('overflow-y-auto')
    expect(command?.className).toContain('overscroll-contain')
  })

  it('is visible on the first render when mount animation is disabled', async () => {
    await act(async () => {
      root.render(
        <CommandConfirmation
          request={{
            command: 'echo ready',
            risk_level: 'dangerous',
            execution_reason: 'Confirm command',
            possible_risk: 'Runs a command'
          }}
          onConfirm={() => {}}
          onCancel={() => {}}
          animateOnMount={false}
        />
      )
    })

    const confirmation = container.querySelector('[data-testid="command-confirmation"]')
    const shell = container.querySelector('[data-testid="command-confirmation-shell"]')
    const allClassNames = getClassNames(container)

    expect(confirmation?.className).toContain('translate-y-0')
    expect(confirmation?.className).toContain('transition-none')
    expect(confirmation?.className).not.toContain('opacity-')
    expect(allClassNames).toContain('backdrop-blur-3xl')
    expect(confirmation?.className).not.toContain('translate-y-2')
    expect(shell?.className).toContain('bg-black/5')
    expect(shell?.className).toContain('backdrop-blur-3xl')
    expect(shell?.className).toContain('dark:bg-white/5')
    expect(shell?.className).not.toContain('/[')
    expect(shell?.className).not.toContain('/28')
  })
})

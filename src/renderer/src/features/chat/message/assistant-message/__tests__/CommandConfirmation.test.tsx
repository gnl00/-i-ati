// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const clipboardWriteText = vi.hoisted(() => vi.fn())
const toastError = vi.hoisted(() => vi.fn())

vi.mock('sonner', () => ({
  toast: {
    error: toastError
  }
}))

import { CommandConfirmation } from '../CommandConfirmation'

interface Deferred {
  promise: Promise<void>
  resolve: () => void
  reject: (reason?: unknown) => void
}

const createDeferred = (): Deferred => {
  let resolve: () => void = () => {}
  let reject: (reason?: unknown) => void = () => {}
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, resolve, reject }
}

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
    clipboardWriteText.mockReset()
    toastError.mockReset()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteText }
    })
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
            command: `wiki {"action":"write","content":"${'x'.repeat(1800)}"}`,
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
    expect(shell?.className).toContain('border-slate-200/45')
    expect(shell?.className).toContain('bg-white/42')
    expect(shell?.className).toContain('backdrop-blur-xl')
    expect(shell?.className).toContain('shadow-[0_10px_30px_-24px_rgba(15,23,42,0.20)]')
    expect(shell?.className).toContain('dark:border-white/10')
    expect(shell?.className).toContain('dark:bg-slate-950/55')
    expect(shell?.className).toContain('dark:shadow-[0_18px_42px_-28px_rgba(0,0,0,0.58)]')
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
    expect(shell?.className).toContain('border-slate-200/45')
    expect(shell?.className).toContain('bg-white/42')
    expect(shell?.className).toContain('backdrop-blur-xl')
    expect(shell?.className).toContain('shadow-[0_10px_30px_-24px_rgba(15,23,42,0.20)]')
    expect(shell?.className).toContain('dark:border-white/10')
    expect(shell?.className).toContain('dark:bg-slate-950/55')
    expect(shell?.className).toContain('dark:shadow-[0_18px_42px_-28px_rgba(0,0,0,0.58)]')
  })

  it('shows command copy success after resolution and restores after 1200ms', async () => {
    clipboardWriteText.mockResolvedValue(undefined)

    await act(async () => {
      root.render(
        <CommandConfirmation
          request={{
            command: 'pnpm test',
            risk_level: 'risky',
            execution_reason: 'Confirm command',
            possible_risk: 'Runs local tests'
          }}
          onConfirm={() => {}}
          onCancel={() => {}}
          animateOnMount={false}
        />
      )
    })

    const button = container.querySelector<HTMLButtonElement>('button[aria-label="Copy command"]')
    const iconSlot = container.querySelector('[data-testid="command-copy-icon-slot"]')

    expect(button?.title).toBe('Copy command')
    expect(button?.className).toContain('duration-[160ms]')
    expect(button?.className).toContain('active:scale-[0.97]')
    expect(iconSlot?.className).toContain('h-3')

    await act(async () => {
      button?.click()
    })

    expect(clipboardWriteText).toHaveBeenCalledWith('pnpm test')
    expect(button?.getAttribute('aria-label')).toBe('Copied')
    expect(button?.title).toBe('Copied')
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Copied')
    expect(container.querySelector('[data-testid="command-copy-icon"]')?.getAttribute('class')).toContain('opacity-0')
    expect(container.querySelector('[data-testid="command-copy-success-icon"]')?.getAttribute('class')).toContain('opacity-100')

    act(() => vi.advanceTimersByTime(1199))
    expect(button?.getAttribute('aria-label')).toBe('Copied')

    act(() => vi.advanceTimersByTime(1))
    expect(button?.getAttribute('aria-label')).toBe('Copy command')
    expect(container.querySelector('[role="status"]')?.textContent).toBe('')
  })

  it('keeps command copy idle and reports a clipboard failure', async () => {
    clipboardWriteText.mockRejectedValue(new Error('clipboard denied'))

    await act(async () => {
      root.render(
        <CommandConfirmation
          request={{
            command: 'pnpm test',
            risk_level: 'risky',
            execution_reason: 'Confirm command',
            possible_risk: 'Runs local tests'
          }}
          onConfirm={() => {}}
          onCancel={() => {}}
          animateOnMount={false}
        />
      )
    })

    const button = container.querySelector<HTMLButtonElement>('button[aria-label="Copy command"]')
    await act(async () => {
      button?.click()
    })

    expect(button?.getAttribute('aria-label')).toBe('Copy command')
    expect(container.querySelector('[role="status"]')?.textContent).toBe('')
    expect(toastError).toHaveBeenCalledOnce()
    expect(toastError).toHaveBeenCalledWith('Copy failed')
  })

  it('lets only the latest command copy attempt update feedback', async () => {
    const firstAttempt = createDeferred()
    const secondAttempt = createDeferred()
    clipboardWriteText
      .mockReturnValueOnce(firstAttempt.promise)
      .mockReturnValueOnce(secondAttempt.promise)

    await act(async () => {
      root.render(
        <CommandConfirmation
          request={{
            command: 'pnpm test',
            risk_level: 'risky',
            execution_reason: 'Confirm command',
            possible_risk: 'Runs local tests'
          }}
          onConfirm={() => {}}
          onCancel={() => {}}
          animateOnMount={false}
        />
      )
    })

    const button = container.querySelector<HTMLButtonElement>('button[aria-label="Copy command"]')
    await act(async () => {
      button?.click()
      button?.click()
      secondAttempt.resolve()
      await secondAttempt.promise
    })
    expect(button?.getAttribute('aria-label')).toBe('Copied')

    await act(async () => {
      firstAttempt.reject(new Error('stale failure'))
      await expect(firstAttempt.promise).rejects.toThrow('stale failure')
    })

    expect(button?.getAttribute('aria-label')).toBe('Copied')
    expect(toastError).not.toHaveBeenCalled()
  })
})

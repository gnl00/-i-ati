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

import { ErrorMessage } from '../error-message'

const error = {
  name: 'WrappedError',
  message: 'Request failed',
  cause: {
    name: 'ProviderError',
    message: 'Rate limited',
    code: 'RATE_LIMITED',
    stack: 'ProviderError: Rate limited\n  at request'
  },
  timestamp: 1
}

describe('ErrorMessage copy feedback', () => {
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
    await act(async () => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  it('keeps the text action stable while showing success for 1200ms', async () => {
    clipboardWriteText.mockResolvedValue(undefined)

    await act(async () => {
      root.render(<ErrorMessage error={error} />)
    })

    const button = container.querySelector<HTMLButtonElement>('button[aria-label="Copy Error"]')
    const iconSlot = container.querySelector('[data-testid="error-copy-icon-slot"]')
    const labelSlot = container.querySelector('[data-testid="error-copy-label-slot"]')

    expect(button?.title).toBe('Copy Error')
    expect(button?.className).toContain('h-7')
    expect(button?.className).toContain('text-xs')
    expect(button?.className).toContain('duration-[160ms]')
    expect(iconSlot?.className).toContain('h-3')
    expect(labelSlot?.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelector('[data-testid="error-copy-label"]')?.getAttribute('class')).toContain('opacity-100')
    expect(container.querySelector('[data-testid="error-copy-success-label"]')?.getAttribute('class')).toContain('opacity-0')

    await act(async () => {
      button?.click()
    })

    expect(clipboardWriteText).toHaveBeenCalledWith(
      'Error: ProviderError\nMessage: Rate limited\nCode: RATE_LIMITED\n\nWrapped By: WrappedError: Request failed\n\nStack:\nProviderError: Rate limited\n  at request'
    )
    expect(button?.getAttribute('aria-label')).toBe('Copied')
    expect(button?.title).toBe('Copied')
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Copied')
    expect(container.querySelector('[data-testid="error-copy-icon"]')?.getAttribute('class')).toContain('opacity-0')
    expect(container.querySelector('[data-testid="error-copy-success-icon"]')?.getAttribute('class')).toContain('opacity-100')
    expect(container.querySelector('[data-testid="error-copy-label"]')?.getAttribute('class')).toContain('opacity-0')
    expect(container.querySelector('[data-testid="error-copy-success-label"]')?.getAttribute('class')).toContain('opacity-100')

    act(() => vi.advanceTimersByTime(1199))
    expect(button?.getAttribute('aria-label')).toBe('Copied')

    act(() => vi.advanceTimersByTime(1))
    expect(button?.getAttribute('aria-label')).toBe('Copy Error')
    expect(container.querySelector('[role="status"]')?.textContent).toBe('')
  })

  it('keeps the error action idle and reports a clipboard failure', async () => {
    clipboardWriteText.mockRejectedValue(new Error('clipboard denied'))

    await act(async () => {
      root.render(<ErrorMessage error={error} />)
    })

    const button = container.querySelector<HTMLButtonElement>('button[aria-label="Copy Error"]')
    await act(async () => {
      button?.click()
    })

    expect(button?.getAttribute('aria-label')).toBe('Copy Error')
    expect(container.querySelector('[role="status"]')?.textContent).toBe('')
    expect(toastError).toHaveBeenCalledOnce()
    expect(toastError).toHaveBeenCalledWith('Copy failed')
  })
})

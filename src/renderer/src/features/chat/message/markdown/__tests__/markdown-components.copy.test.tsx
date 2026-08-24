// @vitest-environment happy-dom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const clipboardWriteText = vi.hoisted(() => vi.fn())
const toastError = vi.hoisted(() => vi.fn())

vi.mock('@renderer/features/chat/common/SpeedCodeHighlight', () => ({
  SpeedCodeHighlight: ({ code }: { code: string }): React.ReactElement => (
    <div data-testid="speed-code-highlight">{code}</div>
  )
}))

vi.mock('sonner', () => ({
  toast: {
    error: toastError
  }
}))

import { markdownCodeComponents } from '../markdown-components'

const CodeComponent = markdownCodeComponents.code as React.ComponentType<{
  children: React.ReactNode
  className?: string
  inline?: boolean
}>

interface Deferred {
  promise: Promise<void>
  resolve: () => void
}

const createDeferred = (): Deferred => {
  let resolve: () => void = () => {}
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}

describe('markdown code copy feedback', () => {
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

  it('shows inline success after the clipboard resolves and restores after 1200ms', async () => {
    clipboardWriteText.mockResolvedValue(undefined)

    await act(async () => {
      root.render(
        <CodeComponent className="language-ts" inline={false}>
          {'const answer = 42\n'}
        </CodeComponent>
      )
    })

    const button = container.querySelector<HTMLButtonElement>('button[aria-label="Copy code"]')
    const iconSlot = container.querySelector('[data-testid="code-copy-icon-slot"]')

    expect(button?.title).toBe('Copy code')
    expect(button?.className).toContain('h-7')
    expect(button?.className).toContain('duration-[160ms]')
    expect(button?.className).toContain('active:scale-[0.97]')
    expect(iconSlot?.className).toContain('h-3.5')
    expect(container.querySelector('[role="status"]')?.textContent).toBe('')

    await act(async () => {
      button?.click()
    })

    expect(clipboardWriteText).toHaveBeenCalledWith('const answer = 42')
    expect(button?.getAttribute('aria-label')).toBe('Copied')
    expect(button?.title).toBe('Copied')
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Copied')
    expect(container.querySelector('[data-testid="code-copy-icon"]')?.getAttribute('class')).toContain('opacity-0')
    expect(container.querySelector('[data-testid="code-copy-success-icon"]')?.getAttribute('class')).toContain('opacity-100')

    act(() => vi.advanceTimersByTime(1199))
    expect(button?.getAttribute('aria-label')).toBe('Copied')

    act(() => vi.advanceTimersByTime(1))
    expect(button?.getAttribute('aria-label')).toBe('Copy code')
    expect(container.querySelector('[role="status"]')?.textContent).toBe('')
  })

  it('keeps the copy state and reports a clipboard failure', async () => {
    clipboardWriteText.mockRejectedValue(new Error('clipboard denied'))

    await act(async () => {
      root.render(
        <CodeComponent className="language-ts" inline={false}>
          {'const answer = 42\n'}
        </CodeComponent>
      )
    })

    const button = container.querySelector<HTMLButtonElement>('button[aria-label="Copy code"]')
    await act(async () => {
      button?.click()
    })

    expect(button?.getAttribute('aria-label')).toBe('Copy code')
    expect(container.querySelector('[role="status"]')?.textContent).toBe('')
    expect(toastError).toHaveBeenCalledOnce()
    expect(toastError).toHaveBeenCalledWith('Copy failed')
  })

  it('clears success feedback when streamed code changes', async () => {
    clipboardWriteText.mockResolvedValue(undefined)

    await act(async () => {
      root.render(
        <CodeComponent className="language-ts" inline={false}>
          {'const answer = 4\n'}
        </CodeComponent>
      )
    })

    const button = container.querySelector<HTMLButtonElement>('button[aria-label="Copy code"]')
    await act(async () => {
      button?.click()
    })
    expect(button?.getAttribute('aria-label')).toBe('Copied')

    await act(async () => {
      root.render(
        <CodeComponent className="language-ts" inline={false}>
          {'const answer = 42\n'}
        </CodeComponent>
      )
    })

    expect(button?.getAttribute('aria-label')).toBe('Copy code')
    expect(container.querySelector('[role="status"]')?.textContent).toBe('')
  })

  it('ignores a pending copy result after streamed code changes', async () => {
    const deferred = createDeferred()
    clipboardWriteText.mockReturnValueOnce(deferred.promise).mockResolvedValue(undefined)

    await act(async () => {
      root.render(
        <CodeComponent className="language-ts" inline={false}>
          {'const answer = 4\n'}
        </CodeComponent>
      )
    })

    const button = container.querySelector<HTMLButtonElement>('button[aria-label="Copy code"]')
    await act(async () => {
      button?.click()
    })

    await act(async () => {
      root.render(
        <CodeComponent className="language-ts" inline={false}>
          {'const answer = 42\n'}
        </CodeComponent>
      )
    })

    await act(async () => {
      deferred.resolve()
      await deferred.promise
    })

    expect(button?.getAttribute('aria-label')).toBe('Copy code')
    expect(container.querySelector('[role="status"]')?.textContent).toBe('')

    await act(async () => {
      button?.click()
    })
    expect(clipboardWriteText).toHaveBeenLastCalledWith('const answer = 42')
    expect(button?.getAttribute('aria-label')).toBe('Copied')
  })
})

// @vitest-environment happy-dom

import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CopyButton, MessageOperations } from '../message-operations'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const toastError = vi.hoisted(() => vi.fn())

vi.mock('sonner', () => ({
  toast: {
    error: toastError
  }
}))

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
    toastError.mockReset()
    vi.useRealTimers()
  })

  it('waits for clipboard completion before showing success, then restores the copy state', async () => {
    vi.useFakeTimers()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    const deferred = createDeferred()
    const onClick = vi.fn(() => deferred.promise)

    act(() => {
      root?.render(<CopyButton label="Copy result" onClick={onClick} />)
    })

    const button = container.querySelector<HTMLButtonElement>('button[aria-label="Copy result"]')
    expect(button?.type).toBe('button')
    expect(button?.getAttribute('aria-label')).toBe('Copy result')
    expect(container.querySelector('[data-testid="copy-icon"]')?.getAttribute('class')).toContain('opacity-100')
    expect(container.querySelector('[data-testid="copy-success-icon"]')?.getAttribute('class')).toContain('opacity-0')
    expect(container.querySelector('[role="status"]')?.textContent).toBe('')

    await act(async () => {
      button?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const tooltip = container.querySelector('[role="tooltip"]')
    expect(tooltip?.className).toContain('dark:bg-(--app-surface-raised)')
    expect(tooltip?.className).toContain('dark:border-(--app-border-standard)')
    expect(tooltip?.className).toContain('dark:text-(--app-text-primary)')
    expect(tooltip?.firstElementChild?.className).toContain('dark:border-t-(--app-surface-raised)')
    expect(onClick).toHaveBeenCalledOnce()
    expect(button?.getAttribute('aria-label')).toBe('Copy result')
    expect(container.querySelector('[role="status"]')?.textContent).toBe('')

    await act(async () => {
      deferred.resolve()
      await deferred.promise
    })

    expect(button?.getAttribute('aria-label')).toBe('Copied')
    expect(tooltip?.textContent).toContain('Copied')
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Copied')
    expect(container.querySelector('[data-testid="copy-icon"]')?.getAttribute('class')).toContain('opacity-0')
    expect(container.querySelector('[data-testid="copy-success-icon"]')?.getAttribute('class')).toContain('opacity-100')

    act(() => vi.advanceTimersByTime(1199))
    expect(button?.getAttribute('aria-label')).toBe('Copied')

    act(() => vi.advanceTimersByTime(1))
    expect(button?.getAttribute('aria-label')).toBe('Copy result')
    expect(container.querySelector('[role="status"]')?.textContent).toBe('')
  })

  it('keeps fixed icon slots and reduced-motion fallbacks in default and compact variants', () => {
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
    const footerSlot = footerButton?.querySelector('[data-testid="copy-icon-slot"]')
    const compactSlot = compactButton?.querySelector('[data-testid="copy-icon-slot"]')

    expect(footerButton?.className).toContain('w-7')
    expect(footerButton?.className).toContain('duration-[160ms]')
    expect(footerButton?.className).toContain('active:scale-[0.97]')
    expect(footerButton?.className).toContain('backdrop-blur-sm')
    expect(footerSlot?.className).toContain('h-4')
    expect(footerSlot?.className).toContain('w-4')
    expect(footerIcon?.getAttribute('class')).toContain('h-full')

    expect(compactButton?.className).toContain('h-6')
    expect(compactButton?.className).toContain('w-6')
    expect(compactButton?.className).toContain('transition-[color,background-color,box-shadow,transform]')
    expect(compactButton?.className).toContain('duration-[160ms]')
    expect(compactButton?.className).toContain('hover:bg-black/5')
    expect(compactButton?.className).toContain('active:scale-[0.97]')
    expect(compactButton?.className).not.toContain('backdrop-blur-sm')
    expect(compactSlot?.className).toContain('h-3')
    expect(compactSlot?.className).toContain('w-3')
    expect(compactIcon?.getAttribute('class')).toContain('w-full')
    expect(compactButton?.title).toBe('Copy inspector')

    for (const button of [footerButton, compactButton]) {
      expect(button?.className).toContain('motion-reduce:transition-colors')
      expect(button?.className).toContain('motion-reduce:active:scale-none')
    }
    for (const icon of [footerIcon, compactIcon]) {
      expect(icon?.getAttribute('class')).toContain('motion-reduce:transition-none')
    }
  })

  it('keeps the copy state on failure and reports one error toast', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(
        <CopyButton
          variant="compact"
          label="Copy inspector"
          onClick={() => Promise.reject(new Error('clipboard denied'))}
        />
      )
    })

    const button = container.querySelector<HTMLButtonElement>('button')
    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(button?.getAttribute('aria-label')).toBe('Copy inspector')
    expect(button?.title).toBe('Copy inspector')
    expect(container.querySelector('[role="status"]')?.textContent).toBe('')
    expect(container.querySelector('[data-testid="copy-icon"]')?.getAttribute('class')).toContain('opacity-100')
    expect(toastError).toHaveBeenCalledOnce()
    expect(toastError).toHaveBeenCalledWith('Copy failed')
  })

  it('keeps an explicit quiet no-op in the idle state', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(<CopyButton onClick={() => false} />)
    })

    const button = container.querySelector<HTMLButtonElement>('button')
    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(button?.getAttribute('aria-label')).toBe('Copy')
    expect(container.querySelector('[role="status"]')?.textContent).toBe('')
    expect(toastError).not.toHaveBeenCalled()
  })

  it('restarts the success timeout after a repeated copy', async () => {
    vi.useFakeTimers()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    const secondAttempt = createDeferred()
    const onClick = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockReturnValueOnce(secondAttempt.promise)

    act(() => {
      root?.render(<CopyButton onClick={onClick} />)
    })

    const button = container.querySelector<HTMLButtonElement>('button')
    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(button?.getAttribute('aria-label')).toBe('Copied')

    act(() => vi.advanceTimersByTime(800))
    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    act(() => vi.advanceTimersByTime(400))
    expect(button?.getAttribute('aria-label')).toBe('Copy')
    expect(onClick).toHaveBeenCalledTimes(2)

    await act(async () => {
      secondAttempt.resolve()
      await secondAttempt.promise
    })
    expect(button?.getAttribute('aria-label')).toBe('Copied')

    act(() => vi.advanceTimersByTime(1199))
    expect(button?.getAttribute('aria-label')).toBe('Copied')

    act(() => vi.advanceTimersByTime(1))
    expect(button?.getAttribute('aria-label')).toBe('Copy')
  })

  it('publishes a new live-region event for each successful copy', async () => {
    vi.useFakeTimers()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    const onClick = vi.fn().mockResolvedValue(undefined)

    act(() => {
      root?.render(<CopyButton onClick={onClick} />)
    })

    const button = container.querySelector<HTMLButtonElement>('button')
    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const status = container.querySelector('[role="status"]')
    const firstAnnouncement = status?.firstElementChild
    expect(firstAnnouncement?.textContent).toBe('Copied')

    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onClick).toHaveBeenCalledTimes(2)
    expect(button?.getAttribute('aria-label')).toBe('Copied')
    expect(status?.firstElementChild?.textContent).toBe('Copied')
    expect(status?.firstElementChild).not.toBe(firstAnnouncement)
  })

  it('keeps copy feedback active through the StrictMode effect cycle', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(
        <StrictMode>
          <CopyButton onClick={() => Promise.resolve()} />
        </StrictMode>
      )
    })

    const button = container.querySelector<HTMLButtonElement>('button')
    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(button?.getAttribute('aria-label')).toBe('Copied')
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Copied')
  })

  it('lets only the latest concurrent copy attempt update feedback', async () => {
    vi.useFakeTimers()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    const firstAttempt = createDeferred()
    const secondAttempt = createDeferred()
    const onClick = vi.fn()
      .mockReturnValueOnce(firstAttempt.promise)
      .mockReturnValueOnce(secondAttempt.promise)

    act(() => {
      root?.render(<CopyButton onClick={onClick} />)
    })

    const button = container.querySelector<HTMLButtonElement>('button')
    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      secondAttempt.resolve()
      await secondAttempt.promise
    })
    expect(button?.getAttribute('aria-label')).toBe('Copied')

    act(() => vi.advanceTimersByTime(800))
    await act(async () => {
      firstAttempt.reject(new Error('stale failure'))
      await expect(firstAttempt.promise).rejects.toThrow('stale failure')
    })

    expect(button?.getAttribute('aria-label')).toBe('Copied')
    expect(toastError).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(400))
    expect(button?.getAttribute('aria-label')).toBe('Copy')
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
    const pad = (value: number): string => String(value).padStart(2, '0')
    const createdAtDate = new Date(1)
    const expectedDateLabel = `${createdAtDate.getFullYear()}-${pad(createdAtDate.getMonth() + 1)}-${pad(createdAtDate.getDate())} ${pad(createdAtDate.getHours())}:${pad(createdAtDate.getMinutes())}:${pad(createdAtDate.getSeconds())}`
    expect(metaGroup?.textContent).toContain(expectedDateLabel)
    expect(actionsGroup?.className).toContain('opacity-0')
    expect(actionsGroup?.className).toContain('pointer-events-none')
    expect(actionsGroup?.className).toContain('duration-[160ms]')
    expect(actionsGroup?.className).toContain('translate-y-1')
    expect(metaGroup?.className).toContain('opacity-0')
    expect(metaGroup?.className).toContain('pointer-events-none')
  })

  it('invokes the assistant branch action when the branch operation is enabled', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    const onBranchClick = vi.fn()

    act(() => {
      root?.render(
        <MessageOperations
          type="assistant"
          message={{ createdAt: 1 }}
          isHovered
          showBranch
          onCopyClick={vi.fn()}
          onBranchClick={onBranchClick}
          onEditClick={vi.fn()}
        />
      )
    })

    const branchButton = container.querySelector<HTMLButtonElement>('[aria-label="Branch chat"]')
    expect(branchButton).not.toBeNull()

    act(() => {
      branchButton?.click()
    })

    expect(onBranchClick).toHaveBeenCalledOnce()
  })

  it('keeps edit disabled while the operation is unavailable', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    const onEditClick = vi.fn()

    act(() => {
      root?.render(
        <MessageOperations
          type="user"
          message={{ createdAt: 1 }}
          isHovered
          onCopyClick={vi.fn()}
          onEditClick={onEditClick}
        />
      )
    })

    const editButton = container.querySelector<HTMLButtonElement>('[aria-label="Edit"]')
    expect(editButton?.disabled).toBe(true)
    expect(editButton?.className).toContain('disabled:cursor-not-allowed')
    expect(editButton?.className).toContain('dark:disabled:text-(--app-text-muted)')

    act(() => {
      editButton?.click()
    })

    expect(onEditClick).not.toHaveBeenCalled()
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

    const tooltip = container.querySelector('[role="tooltip"]')
    expect(tooltip?.className).toContain('dark:bg-(--app-surface-raised)')
    expect(tooltip?.className).toContain('dark:border-(--app-border-standard)')
    expect(tooltip?.className).toContain('dark:text-(--app-text-primary)')
    expect(tooltip?.lastElementChild?.className).toContain('dark:border-t-(--app-surface-raised)')
  })
})

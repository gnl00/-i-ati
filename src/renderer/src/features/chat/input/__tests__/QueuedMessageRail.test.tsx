// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueuedMessageRail, getQueuedMessagePreview } from '../QueuedMessageRail'
import type { QueuedChatMessage } from '../queuePolicy'

const message = (overrides: Partial<QueuedChatMessage> = {}): QueuedChatMessage => ({
  id: 'queue-1',
  status: 'queued',
  text: 'Keep the answer focused on the renderer contract',
  images: [],
  ...overrides
})

describe('QueuedMessageRail', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('shows the first message, remaining count, and inserts from a button', async () => {
    const onInsert = vi.fn()

    await act(async () => {
      root.render(
        <QueuedMessageRail
          message={message({ text: '请继续关注当前 renderer 的消息边界' })}
          remainingCount={2}
          canInsert
          onInsert={onInsert}
          onEdit={() => undefined}
          onRemove={() => undefined}
        />
      )
    })

    expect(container.textContent).toContain('Next')
    expect(container.textContent).toContain('请继续关注当前 renderer 的消息边界')
    expect(container.textContent).toContain('+2')

    const button = container.querySelector('button')
    expect(button?.disabled).toBe(false)
    await act(async () => {
      button?.click()
    })
    expect(onInsert).toHaveBeenCalledOnce()
  })

  it('announces image-only messages with a stable preview', async () => {
    await act(async () => {
      root.render(
        <QueuedMessageRail
          message={message({
            text: '',
            images: ['data:image/png;base64,first', 'data:image/png;base64,second']
          })}
          remainingCount={0}
          canInsert
          onInsert={() => undefined}
          onEdit={() => undefined}
          onRemove={() => undefined}
        />
      )
    })

    expect(container.textContent).toContain('2 images queued')
    expect(container.querySelector('[role="status"]')?.getAttribute('aria-live')).toBe('polite')
  })

  it('locks the action while a steer is waiting for its checkpoint', async () => {
    const onInsert = vi.fn()

    await act(async () => {
      root.render(
        <QueuedMessageRail
          message={message({ status: 'inserting' })}
          remainingCount={0}
          canInsert
          onInsert={onInsert}
          onEdit={() => undefined}
          onRemove={() => undefined}
        />
      )
    })

    expect(container.textContent).toContain('Guiding')
    expect(container.textContent).toContain('Waiting')
    expect(container.querySelector('button')?.disabled).toBe(true)
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Queued message actions"]')?.disabled).toBe(true)
  })

  it('offers edit and remove actions for the queued head', async () => {
    const onEdit = vi.fn()
    const onRemove = vi.fn()

    await act(async () => {
      root.render(
        <QueuedMessageRail
          message={message()}
          remainingCount={0}
          canInsert
          onInsert={() => undefined}
          onEdit={onEdit}
          onRemove={onRemove}
        />
      )
    })

    const openMenu = async (): Promise<void> => {
      const trigger = container.querySelector<HTMLButtonElement>('[aria-label="Queued message actions"]')
      await act(async () => {
        trigger?.dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true,
          button: 0,
          isPrimary: true
        }))
      })
    }

    await openMenu()
    const menu = document.querySelector<HTMLElement>('[role="menu"][aria-label="Queued message actions"]')
    expect(menu?.querySelectorAll('[role="menuitem"]')).toHaveLength(2)
    expect(menu?.querySelectorAll('[role="separator"]')).toHaveLength(1)

    const editItem = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      .find(item => item.textContent?.includes('Edit'))
    expect(editItem).toBeTruthy()
    await act(async () => {
      editItem?.click()
    })
    expect(onEdit).toHaveBeenCalledOnce()

    await openMenu()
    const removeItem = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      .find(item => item.textContent?.includes('Remove'))
    expect(removeItem).toBeTruthy()
    await act(async () => {
      removeItem?.click()
    })
    expect(onRemove).toHaveBeenCalledOnce()
  })

  it('normalizes long mixed-language previews without mutating their content', () => {
    expect(getQueuedMessagePreview(message({
      text: '  先检查 tool call   result，then keep this deliberately long direction intact  '
    }))).toBe('先检查 tool call result，then keep this deliberately long direction intact')
  })
})

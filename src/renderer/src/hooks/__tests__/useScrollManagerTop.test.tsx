// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RefObject } from 'react'
import type { Virtualizer } from '@tanstack/react-virtual'
import { useScrollManagerTop } from '../useScrollManagerTop'
import type { UserScrollSource } from '../useScrollManagerTop'

type ChatVirtualizer = Virtualizer<HTMLDivElement, HTMLDivElement>
type ScrollManager = ReturnType<typeof useScrollManagerTop>

const createVirtualizer = () => ({
  scrollToIndex: vi.fn()
}) as unknown as ChatVirtualizer

describe('useScrollManagerTop', () => {
  let container: HTMLDivElement
  let root: Root
  let latestManager: ScrollManager
  let virtualizer: ChatVirtualizer
  let virtualizerRef: RefObject<ChatVirtualizer | null>

  const renderProbe = async ({
    messagesLength = 2,
    chatUuid = 'chat-1',
    suppressScrollIntentRef = { current: false },
    onUserScrollIntentRef,
    onUserScrollUpIntentRef
  }: {
    messagesLength?: number
    chatUuid?: string
    suppressScrollIntentRef?: RefObject<boolean>
    onUserScrollIntentRef?: RefObject<((source: UserScrollSource) => void) | null>
    onUserScrollUpIntentRef?: RefObject<((source: UserScrollSource) => void) | null>
  } = {}) => {
    function Probe() {
      latestManager = useScrollManagerTop({
        messagesLength,
        chatUuid,
        virtualizerRef,
        suppressScrollIntentRef,
        onUserScrollIntentRef,
        onUserScrollUpIntentRef
      })
      return <div ref={latestManager.scrollParentRef} />
    }

    await act(async () => {
      root.render(<Probe />)
    })
  }

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    virtualizer = createVirtualizer()
    virtualizerRef = { current: virtualizer }
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
    vi.unstubAllGlobals()
  })

  it('latches the button after wheel-up', async () => {
    await renderProbe()
    const scrollContainer = container.firstElementChild as HTMLDivElement

    await act(async () => {
      scrollContainer.dispatchEvent(new WheelEvent('wheel', { deltaY: -20 }))
    })
    expect(latestManager.showJumpToLatest).toBe(true)
  })

  it('supports explicit show and hide and clears the button when the chat changes', async () => {
    await renderProbe()
    await act(async () => {
      latestManager.showJumpToLatestButton()
    })
    expect(latestManager.showJumpToLatest).toBe(true)

    await renderProbe({ chatUuid: 'chat-2' })
    expect(latestManager.showJumpToLatest).toBe(false)

    await act(async () => {
      latestManager.showJumpToLatestButton()
      latestManager.hideJumpToLatestButton()
    })
    expect(latestManager.showJumpToLatest).toBe(false)

    await act(async () => {
      latestManager.showJumpToLatestButton()
    })
    await renderProbe({ chatUuid: 'chat-2', messagesLength: 0 })
    expect(latestManager.showJumpToLatest).toBe(false)
  })

  it('latches the button when a pointer drag moves upward', async () => {
    await renderProbe()
    const scrollContainer = container.firstElementChild as HTMLDivElement

    scrollContainer.scrollTop = 100
    await act(async () => {
      scrollContainer.dispatchEvent(new Event('scroll'))
      scrollContainer.dispatchEvent(new PointerEvent('pointerdown'))
      scrollContainer.scrollTop = 50
      scrollContainer.dispatchEvent(new Event('scroll'))
    })

    expect(latestManager.showJumpToLatest).toBe(true)
  })

  it('keeps the button latched while a pointer drag moves toward the bottom', async () => {
    await renderProbe()
    const scrollContainer = container.firstElementChild as HTMLDivElement

    await act(async () => {
      latestManager.showJumpToLatestButton()
      scrollContainer.scrollTop = 50
      scrollContainer.dispatchEvent(new Event('scroll'))
      scrollContainer.dispatchEvent(new PointerEvent('pointerdown'))
      scrollContainer.scrollTop = 100
      scrollContainer.dispatchEvent(new Event('scroll'))
    })

    expect(latestManager.showJumpToLatest).toBe(true)
  })

  it('delivers explicit wheel intent while the suppression window is active', async () => {
    const suppressScrollIntentRef = { current: true }
    const onUserScrollIntent = vi.fn()
    const onUserScrollUpIntent = vi.fn()
    await renderProbe({
      suppressScrollIntentRef,
      onUserScrollIntentRef: { current: onUserScrollIntent },
      onUserScrollUpIntentRef: { current: onUserScrollUpIntent }
    })
    const scrollContainer = container.firstElementChild as HTMLDivElement

    await act(async () => {
      scrollContainer.dispatchEvent(new WheelEvent('wheel', { deltaY: -20 }))
    })
    expect(onUserScrollIntent).toHaveBeenCalledWith('wheel')
    expect(onUserScrollUpIntent).toHaveBeenCalledWith('wheel')
    expect(latestManager.showJumpToLatest).toBe(true)
  })

  it('delivers downward wheel intent during suppression without latching the button', async () => {
    const suppressScrollIntentRef = { current: true }
    const onUserScrollIntent = vi.fn()
    const onUserScrollUpIntent = vi.fn()
    await renderProbe({
      suppressScrollIntentRef,
      onUserScrollIntentRef: { current: onUserScrollIntent },
      onUserScrollUpIntentRef: { current: onUserScrollUpIntent }
    })
    const scrollContainer = container.firstElementChild as HTMLDivElement

    await act(async () => {
      scrollContainer.dispatchEvent(new WheelEvent('wheel', { deltaY: 20 }))
    })

    expect(onUserScrollIntent).toHaveBeenCalledWith('wheel')
    expect(onUserScrollUpIntent).not.toHaveBeenCalled()
    expect(latestManager.showJumpToLatest).toBe(false)
  })

  it('delivers pointer-active scroll intent while suppression is active', async () => {
    const suppressScrollIntentRef = { current: true }
    const onUserScrollIntent = vi.fn()
    await renderProbe({
      suppressScrollIntentRef,
      onUserScrollIntentRef: { current: onUserScrollIntent }
    })
    const scrollContainer = container.firstElementChild as HTMLDivElement

    await act(async () => {
      scrollContainer.dispatchEvent(new PointerEvent('pointerdown'))
      scrollContainer.scrollTop = 40
      scrollContainer.dispatchEvent(new Event('scroll'))
    })

    expect(onUserScrollIntent).toHaveBeenCalledWith('pointer')
  })
})

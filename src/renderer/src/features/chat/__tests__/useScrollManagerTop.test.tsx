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
type ProbeOptions = {
  messagesLength?: number
  chatUuid?: string
  suppressScrollIntentRef?: RefObject<boolean>
  onUserScrollIntentRef?: RefObject<((source: UserScrollSource) => void) | null>
  onUserScrollUpIntentRef?: RefObject<((source: UserScrollSource) => void) | null>
}

const createVirtualizer = () => ({
  scrollToIndex: vi.fn(),
  scrollToOffset: vi.fn()
}) as unknown as ChatVirtualizer

describe('useScrollManagerTop', () => {
  let container: HTMLDivElement
  let root: Root
  let latestManager: ScrollManager
  let virtualizer: ChatVirtualizer
  let virtualizerRef: RefObject<ChatVirtualizer | null>
  let probeOptions: ProbeOptions
  let nextAnimationFrameId: number
  let animationFrameCallbacks: Map<number, FrameRequestCallback>

  function Probe() {
    const {
      messagesLength = 2,
      chatUuid = 'chat-1',
      suppressScrollIntentRef = { current: false },
      onUserScrollIntentRef,
      onUserScrollUpIntentRef
    } = probeOptions

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

  const renderProbe = async (options: ProbeOptions = {}) => {
    probeOptions = options
    await act(async () => {
      root.render(<Probe />)
    })
  }

  const flushAnimationFrame = async () => {
    const callbacks = [...animationFrameCallbacks.values()]
    animationFrameCallbacks.clear()
    await act(async () => {
      callbacks.forEach(callback => callback(0))
    })
  }

  const setScrollMetrics = (
    element: HTMLDivElement,
    { scrollTop, scrollHeight, clientHeight }: {
      scrollTop: number
      scrollHeight: number
      clientHeight: number
    }
  ) => {
    Object.defineProperties(element, {
      scrollTop: { configurable: true, value: scrollTop, writable: true },
      scrollHeight: { configurable: true, value: scrollHeight },
      clientHeight: { configurable: true, value: clientHeight }
    })
  }

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    nextAnimationFrameId = 0
    animationFrameCallbacks = new Map()
    probeOptions = {}
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = ++nextAnimationFrameId
      animationFrameCallbacks.set(id, callback)
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      animationFrameCallbacks.delete(id)
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

  it('keeps the button hidden after wheel-up at the transcript top', async () => {
    await renderProbe()
    const scrollContainer = container.firstElementChild as HTMLDivElement

    await act(async () => {
      scrollContainer.dispatchEvent(new WheelEvent('wheel', { deltaY: -20 }))
    })
    await flushAnimationFrame()

    expect(latestManager.showJumpToLatest).toBe(false)
  })

  it('keeps the button hidden after wheel-up in a short transcript', async () => {
    await renderProbe()
    const scrollContainer = container.firstElementChild as HTMLDivElement
    setScrollMetrics(scrollContainer, {
      scrollTop: 0,
      scrollHeight: 300,
      clientHeight: 600
    })

    await act(async () => {
      scrollContainer.dispatchEvent(new WheelEvent('wheel', { deltaY: -20 }))
    })
    await flushAnimationFrame()

    expect(latestManager.showJumpToLatest).toBe(false)
  })

  it('keeps the button hidden when wheel-up moves by one pixel', async () => {
    await renderProbe()
    const scrollContainer = container.firstElementChild as HTMLDivElement
    scrollContainer.scrollTop = 120

    await act(async () => {
      scrollContainer.dispatchEvent(new WheelEvent('wheel', { deltaY: -20 }))
    })
    scrollContainer.scrollTop = 119
    await flushAnimationFrame()

    expect(latestManager.showJumpToLatest).toBe(false)
  })

  it('latches after confirmed wheel-up while delivering generic intent immediately', async () => {
    const onUserScrollIntent = vi.fn()
    const onUserScrollUpIntent = vi.fn()
    await renderProbe({
      onUserScrollIntentRef: { current: onUserScrollIntent },
      onUserScrollUpIntentRef: { current: onUserScrollUpIntent }
    })
    const scrollContainer = container.firstElementChild as HTMLDivElement
    scrollContainer.scrollTop = 180

    await act(async () => {
      scrollContainer.dispatchEvent(new WheelEvent('wheel', { deltaY: -20 }))
    })

    expect(onUserScrollIntent).toHaveBeenCalledWith('wheel')
    expect(onUserScrollUpIntent).not.toHaveBeenCalled()
    expect(latestManager.showJumpToLatest).toBe(false)

    scrollContainer.scrollTop = 120
    await flushAnimationFrame()

    expect(onUserScrollUpIntent).toHaveBeenCalledWith('wheel')
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

  it('cancels a pending wheel confirmation when the chat changes', async () => {
    const onUserScrollUpIntent = vi.fn()
    await renderProbe({ onUserScrollUpIntentRef: { current: onUserScrollUpIntent } })
    const scrollContainer = container.firstElementChild as HTMLDivElement
    scrollContainer.scrollTop = 120

    await act(async () => {
      scrollContainer.dispatchEvent(new WheelEvent('wheel', { deltaY: -20 }))
    })
    await renderProbe({
      chatUuid: 'chat-2',
      onUserScrollUpIntentRef: { current: onUserScrollUpIntent }
    })
    scrollContainer.scrollTop = 60
    await flushAnimationFrame()

    expect(onUserScrollUpIntent).not.toHaveBeenCalled()
    expect(latestManager.showJumpToLatest).toBe(false)
  })

  it('cancels a pending wheel confirmation when the hook unmounts', async () => {
    const onUserScrollUpIntent = vi.fn()
    await renderProbe({ onUserScrollUpIntentRef: { current: onUserScrollUpIntent } })
    const scrollContainer = container.firstElementChild as HTMLDivElement
    scrollContainer.scrollTop = 120

    await act(async () => {
      scrollContainer.dispatchEvent(new WheelEvent('wheel', { deltaY: -20 }))
      root.render(<div />)
    })
    scrollContainer.scrollTop = 60
    await flushAnimationFrame()

    expect(onUserScrollUpIntent).not.toHaveBeenCalled()
  })

  it('dispatches index and offset scroll requests in the current frame', async () => {
    await renderProbe()

    await act(async () => {
      latestManager.scrollToMessageIndex(1, true, 'end')
      latestManager.scrollToMessageOffset(320, 'auto')
    })

    expect(virtualizer.scrollToIndex).toHaveBeenCalledWith(1, {
      align: 'end',
      behavior: 'smooth'
    })
    expect(virtualizer.scrollToOffset).toHaveBeenCalledWith(320, {
      behavior: 'auto'
    })
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

  it('keeps the button rendered when manual browsing returns to the bottom', async () => {
    await renderProbe()
    const scrollContainer = container.firstElementChild as HTMLDivElement

    scrollContainer.scrollTop = 100
    await act(async () => {
      scrollContainer.dispatchEvent(new WheelEvent('wheel', { deltaY: -20 }))
    })
    scrollContainer.scrollTop = 50
    await flushAnimationFrame()

    await act(async () => {
      scrollContainer.dispatchEvent(new PointerEvent('pointerdown'))
      scrollContainer.scrollTop = 100
      scrollContainer.dispatchEvent(new Event('scroll'))
      window.dispatchEvent(new PointerEvent('pointerup'))
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
    scrollContainer.scrollTop = 100

    await act(async () => {
      scrollContainer.dispatchEvent(new WheelEvent('wheel', { deltaY: -20 }))
    })
    scrollContainer.scrollTop = 40
    await flushAnimationFrame()

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

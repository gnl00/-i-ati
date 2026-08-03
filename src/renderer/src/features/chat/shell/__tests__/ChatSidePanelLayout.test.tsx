// @vitest-environment happy-dom

import { act, useEffect } from 'react'
import type { ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const reducedMotionState = vi.hoisted(() => ({ value: false }))

vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion')
  return {
    ...actual,
    useReducedMotion: (): boolean => reducedMotionState.value
  }
})

import ChatSidePanelLayout, {
  clampSidePanelWidth,
  getSidePanelLayoutMode,
  getSidePanelWidthBounds
} from '../ChatSidePanelLayout'

describe('ChatSidePanelLayout', () => {
  let container: HTMLDivElement
  let root: Root
  let rootMounted: boolean
  let containerWidth: number
  let resizeCallback: ResizeObserverCallback | null
  let animationFrameId: number
  let animationTimestamp: number
  let animationFrames: Map<number, FrameRequestCallback>
  let capturedPointers: WeakMap<Element, Set<number>>
  let originalPointerCaptureDescriptors: Record<
    'setPointerCapture' | 'hasPointerCapture' | 'releasePointerCapture',
    PropertyDescriptor | undefined
  >

  const renderLayout = async (
    open: boolean,
    preferenceKey: string,
    sidePanel: ReactNode = <div data-testid="side-panel">Artifacts</div>,
    onClose?: () => void
  ): Promise<void> => {
    await act(async () => {
      root.render(
        <ChatSidePanelLayout
          open={open}
          onClose={onClose}
          preferenceKey={preferenceKey}
          sidePanelLabel="Artifacts panel"
          sidePanel={sidePanel}
        >
          <div data-testid="primary-panel">Chat</div>
        </ChatSidePanelLayout>
      )
    })
    rootMounted = true
  }

  const flushAnimationFrames = async (): Promise<void> => {
    await act(async () => {
      const callbacks = [...animationFrames.values()]
      animationFrames.clear()
      animationTimestamp += 16
      callbacks.forEach(callback => callback(animationTimestamp))
    })
  }

  const advanceAnimationFrames = async (durationMs: number): Promise<void> => {
    const frameCount = Math.ceil(durationMs / 16)
    for (let frame = 0; frame < frameCount; frame += 1) {
      await flushAnimationFrames()
    }
  }

  const dispatchKey = async (
    separator: HTMLElement,
    key: string
  ): Promise<void> => {
    await act(async () => {
      separator.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key
      }))
    })
  }

  const dispatchPointer = async (
    separator: HTMLElement,
    type: string,
    init: PointerEventInit
  ): Promise<void> => {
    await act(async () => {
      separator.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        ...init
      }))
    })
  }

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    containerWidth = 1000
    resizeCallback = null
    animationFrameId = 0
    animationTimestamp = 1000
    animationFrames = new Map()
    capturedPointers = new WeakMap()
    reducedMotionState.value = false
    vi.spyOn(performance, 'now').mockImplementation(() => animationTimestamp)
    originalPointerCaptureDescriptors = {
      setPointerCapture: Object.getOwnPropertyDescriptor(
        HTMLElement.prototype,
        'setPointerCapture'
      ),
      hasPointerCapture: Object.getOwnPropertyDescriptor(
        HTMLElement.prototype,
        'hasPointerCapture'
      ),
      releasePointerCapture: Object.getOwnPropertyDescriptor(
        HTMLElement.prototype,
        'releasePointerCapture'
      )
    }

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
      bottom: 0,
      height: 800,
      left: 0,
      right: containerWidth,
      top: 0,
      width: containerWidth,
      x: 0,
      y: 0,
      toJSON: (): object => ({})
    }))

    class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback
      }

      observe(target: Element): void {
        resizeCallback?.([{
          target,
          contentRect: {
            bottom: 0,
            height: 800,
            left: 0,
            right: containerWidth,
            top: 0,
            width: containerWidth,
            x: 0,
            y: 0,
            toJSON: (): object => ({})
          }
        } as ResizeObserverEntry], this as unknown as ResizeObserver)
      }

      disconnect(): void {
        return
      }

      unobserve(target: Element): void {
        void target
      }
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const id = ++animationFrameId
      animationFrames.set(id, callback)
      return id
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      animationFrames.delete(id)
    })

    Object.defineProperties(HTMLElement.prototype, {
      setPointerCapture: {
        configurable: true,
        value(pointerId: number): void {
          const pointers = capturedPointers.get(this) ?? new Set<number>()
          pointers.add(pointerId)
          capturedPointers.set(this, pointers)
        }
      },
      hasPointerCapture: {
        configurable: true,
        value(pointerId: number): boolean {
          return capturedPointers.get(this)?.has(pointerId) ?? false
        }
      },
      releasePointerCapture: {
        configurable: true,
        value(pointerId: number): void {
          capturedPointers.get(this)?.delete(pointerId)
        }
      }
    })

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    rootMounted = false
  })

  afterEach(async () => {
    if (rootMounted) {
      await act(async () => root.unmount())
    }
    container.remove()
    for (const property of [
      'setPointerCapture',
      'hasPointerCapture',
      'releasePointerCapture'
    ] as const) {
      const descriptor = originalPointerCaptureDescriptors[property]
      if (descriptor) {
        Object.defineProperty(HTMLElement.prototype, property, descriptor)
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, property)
      }
    }
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('keeps one panel DOM tree across closed and open push states', async () => {
    await renderLayout(false, 'visibility-default')

    const layout = container.querySelector<HTMLElement>('[data-side-panel-layout]')
    const closedSeparator = container.querySelector<HTMLElement>('[role="separator"]')
    const sideRegion = container.querySelector<HTMLElement>('[data-side-panel-region]')
    const panel = container.querySelector<HTMLElement>('[data-side-panel-content]')
    const panelChild = container.querySelector<HTMLElement>('[data-testid="side-panel"]')
    expect(layout?.getAttribute('data-layout-mode')).toBe('push')
    expect(layout?.style.getPropertyValue('--chat-side-panel-width')).toBe('400px')
    expect(layout?.className).toContain('flex')
    expect(closedSeparator?.getAttribute('aria-hidden')).toBe('true')
    expect(closedSeparator?.tabIndex).toBe(-1)
    expect(sideRegion?.style.width).toBe('0px')
    expect(sideRegion?.getAttribute('aria-hidden')).toBe('true')
    expect(sideRegion?.hasAttribute('inert')).toBe(true)
    expect(panel?.getAttribute('aria-hidden')).toBe('true')
    expect(panel?.hasAttribute('inert')).toBe(true)
    expect(panel?.style.visibility).toBe('hidden')
    expect(panel?.className).toContain('contain-layout')
    expect(panel?.className).toContain('contain-paint')
    expect(panelChild?.textContent).toBe('Artifacts')

    await renderLayout(true, 'visibility-default')
    expect(container.querySelector('[data-side-panel-content]')).toBe(panel)
    expect(container.querySelector('[data-testid="side-panel"]')).toBe(panelChild)
    expect(panel?.getAttribute('aria-hidden')).toBe('false')
    expect(panel?.hasAttribute('inert')).toBe(false)
    expect(panel?.style.visibility).toBe('visible')
    expect(closedSeparator?.getAttribute('data-interactive')).toBe('true')
    expect(closedSeparator?.tabIndex).toBe(0)

    await advanceAnimationFrames(640)
    const separator = container.querySelector<HTMLElement>('[role="separator"]')
    expect(separator?.getAttribute('aria-orientation')).toBe('vertical')
    expect(separator?.getAttribute('aria-valuemin')).toBe('320')
    expect(separator?.getAttribute('aria-valuemax')).toBe('680')
    expect(separator?.getAttribute('aria-valuenow')).toBe('400')
    expect(separator?.getAttribute('aria-hidden')).toBe('false')
    expect(separator?.tabIndex).toBe(0)
    expect(separator?.getAttribute('data-interactive')).toBe('true')
    expect(separator?.className).toContain('hover:bg-primary/[0.06]')
    expect(sideRegion?.style.width).toBe('408px')
    expect(panel?.style.opacity).toBe('1')
    expect(panel?.style.transform).toBe('translate3d(0px, 0px, 0px)')
  })

  it('clips push-mode content with structural width and no aside clip path', async () => {
    await renderLayout(true, 'structural-width-clip')
    await advanceAnimationFrames(640)

    const sideRegion = container.querySelector<HTMLElement>('[data-side-panel-region]')
    const panel = container.querySelector<HTMLElement>('[data-side-panel-content]')
    expect(sideRegion?.className).toContain('overflow-hidden')
    expect(panel?.style.clipPath).toBe('')
    // The absolutely positioned aside keeps its own width, so the shrinking
    // region clips it instead of reflowing its contents.
    expect(panel?.style.width).toBe('400px')
    expect(panel?.style.position).toBe('')
    expect(panel?.className).toContain('absolute')
  })

  it('opens a closed welcome remount with its already-mounted panel content', async () => {
    await renderLayout(false, 'welcome-remount')
    await act(async () => root.unmount())
    rootMounted = false
    root = createRoot(container)

    await renderLayout(false, 'welcome-remount')
    const closedPanel = container.querySelector('[data-side-panel-content]')
    expect(closedPanel).toBeTruthy()

    await renderLayout(true, 'welcome-remount')
    expect(container.querySelector('[data-side-panel-content]')).toBe(closedPanel)
    expect(container.querySelector('[data-testid="side-panel"]')?.textContent).toBe('Artifacts')
  })

  it('hides closed content at progress zero while preserving DOM and side effects', async () => {
    const cleanup = vi.fn()
    const SideEffectProbe = (): ReactNode => {
      useEffect(() => (): void => cleanup(), [])
      return <div data-testid="side-effect-probe">Artifacts</div>
    }
    const sidePanel = <SideEffectProbe />

    await renderLayout(true, 'persistent-lifecycle', sidePanel)
    await advanceAnimationFrames(640)
    const panel = container.querySelector<HTMLElement>('[data-side-panel-content]')
    const probe = container.querySelector('[data-testid="side-effect-probe"]')

    await renderLayout(false, 'persistent-lifecycle', sidePanel)
    expect(container.querySelector('[data-side-panel-content]')).toBe(panel)
    expect(panel?.getAttribute('aria-hidden')).toBe('true')
    expect(panel?.hasAttribute('inert')).toBe(true)
    expect(panel?.style.visibility).toBe('visible')
    expect(cleanup).not.toHaveBeenCalled()

    await advanceAnimationFrames(640)
    expect(container.querySelector('[data-side-panel-content]')).toBe(panel)
    expect(container.querySelector('[data-testid="side-effect-probe"]')).toBe(probe)
    expect(panel?.style.visibility).toBe('hidden')
    expect(panel?.style.opacity).toBe('0')
    expect(cleanup).not.toHaveBeenCalled()

    await act(async () => root.unmount())
    rootMounted = false
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('retargets a rapid close and reopen from the current progress', async () => {
    await renderLayout(true, 'rapid-reversal')
    await advanceAnimationFrames(640)
    const panel = container.querySelector('[data-side-panel-content]')

    await renderLayout(false, 'rapid-reversal')
    await advanceAnimationFrames(160)
    const sideRegion = container.querySelector<HTMLElement>('[data-side-panel-region]')
    const partialWidth = Number.parseFloat(sideRegion?.style.width ?? '0')
    expect(partialWidth).toBeGreaterThan(0)
    expect(partialWidth).toBeLessThan(408)

    await renderLayout(true, 'rapid-reversal')
    expect(container.querySelector('[data-side-panel-content]')).toBe(panel)
    expect(Number.parseFloat(sideRegion?.style.width ?? '0')).toBeCloseTo(partialWidth, 3)
    await advanceAnimationFrames(640)
    expect(sideRegion?.style.width).toBe('408px')
    expect(container.querySelector<HTMLElement>('[data-side-panel-content]')?.style.visibility)
      .toBe('visible')
  })

  it('routes Escape through onClose only while the panel is open', async () => {
    const onClose = vi.fn()
    await renderLayout(true, 'escape-ownership', undefined, onClose)

    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Escape'
    })))
    expect(onClose).toHaveBeenCalledTimes(1)

    await renderLayout(false, 'escape-ownership', undefined, onClose)
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Escape'
    })))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('returns focus to the opener when Escape closes persistent panel content', async () => {
    const onClose = vi.fn()
    const opener = document.createElement('button')
    opener.textContent = 'Open artifacts'
    document.body.appendChild(opener)
    opener.focus()

    await renderLayout(
      true,
      'escape-focus-return',
      <button data-testid="panel-focus-target">Panel action</button>,
      onClose
    )
    const panelTarget = container.querySelector<HTMLButtonElement>('[data-testid="panel-focus-target"]')
    panelTarget?.focus()

    await act(async () => panelTarget?.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Escape'
    })))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it('handles Escape at the capture boundary after default prevention and child propagation guards', async () => {
    const onClose = vi.fn()
    await renderLayout(true, 'escape-capture', undefined, onClose)
    const child = container.querySelector<HTMLElement>('[data-testid="primary-panel"]')
    child?.addEventListener('keydown', event => event.stopPropagation())

    const escapeEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Escape'
    })
    escapeEvent.preventDefault()
    await act(async () => child?.dispatchEvent(escapeEvent))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('preserves open state while Escape belongs to IME composition', async () => {
    const onClose = vi.fn()
    await renderLayout(true, 'escape-ime', undefined, onClose)

    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      isComposing: true,
      key: 'Escape'
    })))

    const legacyImeEscape = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Escape'
    })
    Object.defineProperty(legacyImeEscape, 'keyCode', { value: 229 })
    await act(async () => document.dispatchEvent(legacyImeEscape))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('uses overlay bounds below 648px and push bounds at 648px', () => {
    const regularBounds = getSidePanelWidthBounds(1000)
    expect(regularBounds).toEqual({ min: 320, max: 680 })
    expect(clampSidePanelWidth(120, regularBounds)).toBe(320)
    expect(clampSidePanelWidth(900, regularBounds)).toBe(680)

    const narrowBounds = getSidePanelWidthBounds(500)
    expect(narrowBounds).toEqual({ min: 320, max: 468 })
    expect(clampSidePanelWidth(180, narrowBounds)).toBe(320)
    expect(getSidePanelLayoutMode(500)).toBe('overlay')
    expect(getSidePanelLayoutMode(640)).toBe('overlay')
    expect(getSidePanelLayoutMode(648)).toBe('push')
  })

  it.each([500, 640])('keeps primary content stable in %ipx overlay mode', async (width) => {
    containerWidth = width
    await renderLayout(true, `overlay-${width}`)
    await advanceAnimationFrames(640)

    const layout = container.querySelector<HTMLElement>('[data-side-panel-layout]')
    const primary = container.querySelector<HTMLElement>('[data-testid="primary-panel"]')
      ?.parentElement
    const sideRegion = container.querySelector<HTMLElement>('[data-side-panel-region]')
    const separator = container.querySelector<HTMLElement>('[role="separator"]')
    expect(layout?.getAttribute('data-layout-mode')).toBe('overlay')
    expect(primary?.className).toContain('flex-1')
    expect(sideRegion?.className).toContain('absolute')
    expect(sideRegion?.className).toContain('right-0')
    expect(separator?.className).toContain('absolute')
    expect(Number.parseFloat(sideRegion?.style.width ?? '0')).toBeLessThanOrEqual(488)
  })

  it('supports Arrow, Home, and End keyboard resizing', async () => {
    await renderLayout(true, 'keyboard-resize')
    await flushAnimationFrames()

    const layout = container.querySelector<HTMLElement>('[data-side-panel-layout]')
    const separator = container.querySelector<HTMLElement>('[role="separator"]')
    const sideRegion = container.querySelector<HTMLElement>('[data-side-panel-region]')
    expect(separator).toBeTruthy()
    if (!separator) return

    await dispatchKey(separator, 'ArrowLeft')
    expect(layout?.style.getPropertyValue('--chat-side-panel-width')).toBe('416px')
    expect(sideRegion?.style.width).toBe('424px')
    expect(sideRegion?.getAttribute('data-resize-mode')).toBe('keyboard')

    await dispatchKey(separator, 'ArrowRight')
    expect(layout?.style.getPropertyValue('--chat-side-panel-width')).toBe('400px')

    await dispatchKey(separator, 'Home')
    expect(layout?.style.getPropertyValue('--chat-side-panel-width')).toBe('320px')
    expect(separator.getAttribute('aria-valuenow')).toBe('320')

    await dispatchKey(separator, 'End')
    expect(layout?.style.getPropertyValue('--chat-side-panel-width')).toBe('680px')
    expect(separator.getAttribute('aria-valuenow')).toBe('680')

    await act(async () => {
      await new Promise(resolve => window.setTimeout(resolve, 140))
    })
    expect(sideRegion?.hasAttribute('data-resize-mode')).toBe(false)
  })

  it('isolates pointer and ResizeObserver width updates from structural transitions', async () => {
    await renderLayout(true, 'transition-isolation')
    await flushAnimationFrames()

    const separator = container.querySelector<HTMLElement>('[role="separator"]')
    const sideRegion = container.querySelector<HTMLElement>('[data-side-panel-region]')
    expect(separator).toBeTruthy()
    expect(sideRegion).toBeTruthy()
    if (!separator || !sideRegion) return

    await dispatchPointer(separator, 'pointerdown', {
      clientX: 600,
      pointerId: 13
    })
    expect(sideRegion.getAttribute('data-resize-mode')).toBe('direct')

    await dispatchPointer(separator, 'pointerup', {
      clientX: 600,
      pointerId: 13
    })
    expect(sideRegion.getAttribute('data-resize-mode')).toBe('direct')
    await flushAnimationFrames()
    expect(sideRegion.hasAttribute('data-resize-mode')).toBe(false)

    containerWidth = 1200
    await act(async () => {
      resizeCallback?.([{
        contentRect: {
          width: containerWidth
        } as DOMRectReadOnly
      } as ResizeObserverEntry], {} as ResizeObserver)
    })
    expect(sideRegion.getAttribute('data-resize-mode')).toBe('direct')

    await flushAnimationFrames()
    expect(sideRegion.hasAttribute('data-resize-mode')).toBe(false)
  })

  it('preserves drag preview and committed width when ResizeObserver fires mid-drag', async () => {
    await renderLayout(true, 'resize-during-drag')
    const layout = container.querySelector<HTMLElement>('[data-side-panel-layout]')
    const separator = container.querySelector<HTMLElement>('[role="separator"]')
    const sideRegion = container.querySelector<HTMLElement>('[data-side-panel-region]')
    expect(separator).toBeTruthy()
    if (!separator) return

    await dispatchPointer(separator, 'pointerdown', { clientX: 600, pointerId: 17 })
    await dispatchPointer(separator, 'pointermove', { clientX: 500, pointerId: 17 })
    await flushAnimationFrames()
    expect(layout?.style.getPropertyValue('--chat-side-panel-width')).toBe('400px')
    expect(sideRegion?.style.width).toBe('508px')

    containerWidth = 1200
    await act(async () => resizeCallback?.([{
      contentRect: { width: containerWidth } as DOMRectReadOnly
    } as ResizeObserverEntry], {} as ResizeObserver))
    expect(layout?.style.getPropertyValue('--chat-side-panel-width')).toBe('400px')
    expect(sideRegion?.style.width).toBe('508px')

    await dispatchPointer(separator, 'pointermove', { clientX: 480, pointerId: 17 })
    await flushAnimationFrames()
    expect(sideRegion?.style.width).toBe('528px')
    await dispatchPointer(separator, 'pointerup', { clientX: 480, pointerId: 17 })
    expect(layout?.style.getPropertyValue('--chat-side-panel-width')).toBe('520px')
  })

  it('keeps a short geometry and opacity response for reduced motion', async () => {
    reducedMotionState.value = true
    await renderLayout(false, 'reduced-motion')
    const panel = container.querySelector<HTMLElement>('[data-side-panel-content]')
    await renderLayout(true, 'reduced-motion')

    const sideRegion = container.querySelector<HTMLElement>('[data-side-panel-region]')
    const content = container.querySelector<HTMLElement>('[data-side-panel-content]')
    expect(content).toBe(panel)
    expect(sideRegion?.style.width).toBe('0px')
    expect(content?.style.transform).toBe('translate3d(0px, 0px, 0px)')
    expect(content?.style.opacity).toBe('0')

    await advanceAnimationFrames(120)
    const enteredContent = container.querySelector<HTMLElement>('[data-side-panel-content]')
    expect(enteredContent).toBe(panel)
    expect(enteredContent?.style.transform).toBe('translate3d(0px, 0px, 0px)')
    expect(enteredContent?.style.opacity).toBe('1')

    await renderLayout(false, 'reduced-motion')
    expect(sideRegion?.style.width).toBe('408px')
    expect(container.querySelector('[data-side-panel-content]')).toBe(panel)
    expect(panel?.style.visibility).toBe('visible')
    await advanceAnimationFrames(120)
    expect(container.querySelector('[data-side-panel-content]')).toBe(panel)
    expect(sideRegion?.style.width).toBe('0px')
    expect(panel?.style.visibility).toBe('hidden')
    expect(panel?.style.opacity).toBe('0')
  })

  it('resizes with pointer capture and restores the committed width after remount', async () => {
    const sidePanelRender = vi.fn()
    const SidePanelProbe = (): ReactNode => {
      sidePanelRender()
      return <div data-testid="side-panel">Artifacts</div>
    }
    await renderLayout(true, 'pointer-persistence', <SidePanelProbe />)

    const layout = container.querySelector<HTMLElement>('[data-side-panel-layout]')
    const separator = container.querySelector<HTMLElement>('[role="separator"]')
    const sideRegion = container.querySelector<HTMLElement>('[data-side-panel-region]')
    expect(separator).toBeTruthy()
    if (!separator) return

    await dispatchPointer(separator, 'pointerdown', {
      clientX: 600,
      pointerId: 7
    })
    expect(document.documentElement.style.cursor).toBe('col-resize')
    expect(document.body.style.userSelect).toBe('none')
    expect(sideRegion?.getAttribute('data-resize-mode')).toBe('direct')

    await dispatchPointer(separator, 'pointermove', {
      clientX: 500,
      pointerId: 7
    })
    await flushAnimationFrames()
    expect(layout?.style.getPropertyValue('--chat-side-panel-width')).toBe('400px')
    expect(sideRegion?.style.width).toBe('508px')
    expect(sidePanelRender).toHaveBeenCalledTimes(1)

    await dispatchPointer(separator, 'pointerup', {
      clientX: 500,
      pointerId: 7
    })
    expect(layout?.style.getPropertyValue('--chat-side-panel-width')).toBe('500px')
    expect(document.documentElement.style.cursor).toBe('')
    expect(document.body.style.userSelect).toBe('')
    await flushAnimationFrames()
    expect(sideRegion?.hasAttribute('data-resize-mode')).toBe(false)

    await act(async () => root.unmount())
    rootMounted = false
    root = createRoot(container)
    await renderLayout(true, 'pointer-persistence')

    const restoredLayout = container.querySelector<HTMLElement>('[data-side-panel-layout]')
    expect(restoredLayout?.style.getPropertyValue('--chat-side-panel-width')).toBe('500px')
  })

  it('cleans an active drag and preserves its latest width when unmounted', async () => {
    await renderLayout(true, 'pointer-cleanup')

    const separator = container.querySelector<HTMLElement>('[role="separator"]')
    expect(separator).toBeTruthy()
    if (!separator) return

    await dispatchPointer(separator, 'pointerdown', {
      clientX: 600,
      pointerId: 9
    })
    await dispatchPointer(separator, 'pointermove', {
      clientX: 520,
      pointerId: 9
    })

    await act(async () => root.unmount())
    rootMounted = false
    expect(document.documentElement.style.cursor).toBe('')
    expect(document.documentElement.style.userSelect).toBe('')
    expect(document.body.style.cursor).toBe('')
    expect(document.body.style.userSelect).toBe('')
    expect(animationFrames.size).toBe(0)

    root = createRoot(container)
    await renderLayout(true, 'pointer-cleanup')
    const restoredLayout = container.querySelector<HTMLElement>('[data-side-panel-layout]')
    expect(restoredLayout?.style.getPropertyValue('--chat-side-panel-width')).toBe('480px')
  })

  it('commits the width and restores global styles when pointer capture is lost', async () => {
    await renderLayout(true, 'lost-pointer-capture')

    const separator = container.querySelector<HTMLElement>('[role="separator"]')
    expect(separator).toBeTruthy()
    if (!separator) return

    await dispatchPointer(separator, 'pointerdown', {
      clientX: 600,
      pointerId: 11
    })
    await dispatchPointer(separator, 'pointermove', {
      clientX: 540,
      pointerId: 11
    })
    await flushAnimationFrames()
    await dispatchPointer(separator, 'lostpointercapture', {
      clientX: 540,
      pointerId: 11
    })

    expect(document.documentElement.style.cursor).toBe('')
    expect(document.documentElement.style.userSelect).toBe('')
    expect(document.body.style.cursor).toBe('')
    expect(document.body.style.userSelect).toBe('')

    await act(async () => root.unmount())
    rootMounted = false
    root = createRoot(container)
    await renderLayout(true, 'lost-pointer-capture')
    const restoredLayout = container.querySelector<HTMLElement>('[data-side-panel-layout]')
    expect(restoredLayout?.style.getPropertyValue('--chat-side-panel-width')).toBe('460px')
  })
})

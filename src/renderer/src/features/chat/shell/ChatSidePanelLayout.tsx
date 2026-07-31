import { cn } from '@renderer/shared/lib/utils'
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform
} from 'framer-motion'
import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState
} from 'react'

const DEFAULT_SIDE_PANEL_RATIO = 0.4
const DEFAULT_OVERLAY_PANEL_RATIO = 0.72
const MAX_SIDE_PANEL_RATIO = 0.7
const TARGET_MIN_PANE_WIDTH_PX = 320
const KEYBOARD_RESIZE_STEP_PX = 16
const KEYBOARD_RESIZE_FEEDBACK_MS = 120
const SIDE_PANEL_GUTTER_PX = 8
const OVERLAY_BREAKPOINT_PX = 648
const OVERLAY_MAX_PANEL_WIDTH_PX = 480
const OVERLAY_VIEWPORT_INSET_PX = 24
const REDUCED_MOTION_OPACITY_DURATION_SECONDS = 0.1
const SIDE_PANEL_EASING = [0.32, 0.72, 0, 1] as const
const SIDE_PANEL_SPRING = {
  type: 'spring',
  duration: 0.5,
  bounce: 0.1
} as const

type SidePanelWidthBounds = {
  min: number
  max: number
}

type PointerDragState = {
  pointerId: number
  startClientX: number
  startWidth: number
}

type DocumentInteractionStyles = {
  documentCursor: string
  documentUserSelect: string
  bodyCursor: string
  bodyUserSelect: string
}

type ResizeMode = 'direct' | 'keyboard'
type SidePanelLayoutMode = 'push' | 'overlay'

const sidePanelWidthPreferences = new Map<string, number>()

const releaseCapturedPointer = (
  separator: HTMLDivElement | null,
  pointerId: number
): void => {
  try {
    if (separator?.hasPointerCapture(pointerId)) {
      separator.releasePointerCapture(pointerId)
    }
  } catch {
    // The browser may have already released capture while the separator unmounted.
  }
}

export const getSidePanelLayoutMode = (containerWidth: number): SidePanelLayoutMode =>
  containerWidth < OVERLAY_BREAKPOINT_PX ? 'overlay' : 'push'

export const getSidePanelWidthBounds = (containerWidth: number): SidePanelWidthBounds => {
  const safeContainerWidth = Math.max(0, containerWidth)

  if (getSidePanelLayoutMode(safeContainerWidth) === 'overlay') {
    const max = Math.max(
      0,
      Math.min(
        OVERLAY_MAX_PANEL_WIDTH_PX,
        safeContainerWidth - OVERLAY_VIEWPORT_INSET_PX - SIDE_PANEL_GUTTER_PX
      )
    )
    return {
      min: Math.min(TARGET_MIN_PANE_WIDTH_PX, max),
      max
    }
  }

  const min = Math.min(TARGET_MIN_PANE_WIDTH_PX, safeContainerWidth)
  const widthAvailableAfterPrimaryTarget = Math.max(
    0,
    safeContainerWidth - TARGET_MIN_PANE_WIDTH_PX
  )
  const ratioMaximum = safeContainerWidth * MAX_SIDE_PANEL_RATIO
  const max = Math.max(
    min,
    Math.min(ratioMaximum, widthAvailableAfterPrimaryTarget)
  )

  return { min, max }
}

export const clampSidePanelWidth = (
  width: number,
  bounds: SidePanelWidthBounds
): number => Math.min(bounds.max, Math.max(bounds.min, width))

interface ChatSidePanelLayoutProps {
  children: React.ReactNode
  open: boolean
  onClose?: () => void
  sidePanel: React.ReactNode
  preferenceKey: string
  sidePanelLabel?: string
  className?: string
}

const ChatSidePanelLayout: React.FC<ChatSidePanelLayoutProps> = ({
  children,
  open,
  onClose,
  sidePanel,
  preferenceKey,
  sidePanelLabel = 'Side panel',
  className
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const sideRegionRef = useRef<HTMLDivElement | null>(null)
  const separatorRef = useRef<HTMLDivElement | null>(null)
  const boundsRef = useRef<SidePanelWidthBounds>({ min: 0, max: 0 })
  const widthRef = useRef(0)
  const pendingWidthRef = useRef<number | null>(null)
  const pointerDragRef = useRef<PointerDragState | null>(null)
  const resizeFrameRef = useRef<number | null>(null)
  const resizeTransitionFrameRef = useRef<number | null>(null)
  const keyboardTransitionTimerRef = useRef<number | null>(null)
  const keyboardWidthAnimationRef = useRef<ReturnType<typeof animate> | null>(null)
  const documentStylesRef = useRef<DocumentInteractionStyles | null>(null)
  const asideRef = useRef<HTMLElement | null>(null)
  const openRef = useRef(open)
  const [layoutMode, setLayoutMode] = useState<SidePanelLayoutMode>('push')
  const generatedSidePanelId = useId()
  const shouldReduceMotion = useReducedMotion()
  const sidePanelId = `chat-side-panel-${generatedSidePanelId.replace(/:/g, '')}`
  const progress = useMotionValue(open ? 1 : 0)
  const panelWidth = useMotionValue(0)
  const structuralWidth = useTransform(() => {
    const normalizedProgress = Math.min(1, Math.max(0, progress.get()))
    return normalizedProgress * (panelWidth.get() + SIDE_PANEL_GUTTER_PX)
  })
  const overlayRegionWidth = useTransform(
    panelWidth,
    width => width + SIDE_PANEL_GUTTER_PX
  )
  const separatorOverlayRight = useTransform(
    panelWidth,
    width => width + SIDE_PANEL_GUTTER_PX - 6
  )
  const contentOpacity = useTransform(
    progress,
    value => Math.min(1, Math.max(0, value))
  )
  const contentTransform = useTransform(progress, value => {
    if (shouldReduceMotion) return 'translate3d(0px, 0px, 0px)'
    const normalizedProgress = Math.min(1, Math.max(0, value))
    return `translate3d(${(1 - normalizedProgress) * 8}px, 0px, 0px)`
  })

  openRef.current = open

  const setResizeMode = useCallback((mode: ResizeMode | null): void => {
    const sideRegion = sideRegionRef.current
    if (!sideRegion) return

    if (mode) {
      sideRegion.dataset.resizeMode = mode
    } else {
      delete sideRegion.dataset.resizeMode
    }
  }, [])

  const clearKeyboardTransitionTimer = useCallback((): void => {
    if (keyboardTransitionTimerRef.current !== null) {
      window.clearTimeout(keyboardTransitionTimerRef.current)
      keyboardTransitionTimerRef.current = null
    }
  }, [])

  const clearKeyboardWidthAnimation = useCallback((): void => {
    keyboardWidthAnimationRef.current?.stop()
    keyboardWidthAnimationRef.current = null
  }, [])

  const clearResizeTransitionFrame = useCallback((): void => {
    if (resizeTransitionFrameRef.current !== null) {
      cancelAnimationFrame(resizeTransitionFrameRef.current)
      resizeTransitionFrameRef.current = null
    }
  }, [])

  const applyWidth = useCallback((
    requestedWidth: number,
    animateKeyboardWidth = false
  ): number => {
    const width = clampSidePanelWidth(requestedWidth, boundsRef.current)
    widthRef.current = width
    rootRef.current?.style.setProperty('--chat-side-panel-width', `${width}px`)

    clearKeyboardWidthAnimation()
    if (animateKeyboardWidth && !shouldReduceMotion) {
      keyboardWidthAnimationRef.current = animate(panelWidth, width, {
        duration: KEYBOARD_RESIZE_FEEDBACK_MS / 1000,
        ease: SIDE_PANEL_EASING,
        onComplete: () => {
          keyboardWidthAnimationRef.current = null
        }
      })
    } else {
      panelWidth.set(width)
    }
    if (shouldReduceMotion && layoutMode === 'push' && sideRegionRef.current) {
      sideRegionRef.current.style.width = openRef.current
        ? `${width + SIDE_PANEL_GUTTER_PX}px`
        : '0px'
    }

    const separator = separatorRef.current
    if (separator) {
      separator.setAttribute('aria-valuemin', String(Math.round(boundsRef.current.min)))
      separator.setAttribute('aria-valuemax', String(Math.round(boundsRef.current.max)))
      separator.setAttribute('aria-valuenow', String(Math.round(width)))
    }

    return width
  }, [
    clearKeyboardWidthAnimation,
    layoutMode,
    panelWidth,
    shouldReduceMotion
  ])

  const suspendTransitionForDirectWidth = useCallback((): void => {
    clearKeyboardTransitionTimer()
    clearKeyboardWidthAnimation()
    const currentWidth = panelWidth.get()
    widthRef.current = currentWidth
    rootRef.current?.style.setProperty('--chat-side-panel-width', `${currentWidth}px`)
    clearResizeTransitionFrame()
    setResizeMode('direct')
  }, [
    clearKeyboardTransitionTimer,
    clearKeyboardWidthAnimation,
    clearResizeTransitionFrame,
    panelWidth,
    setResizeMode
  ])

  const restoreTransitionAfterResize = useCallback((): void => {
    clearResizeTransitionFrame()
    resizeTransitionFrameRef.current = requestAnimationFrame(() => {
      resizeTransitionFrameRef.current = null
      if (!pointerDragRef.current) {
        setResizeMode(null)
      }
    })
  }, [clearResizeTransitionFrame, setResizeMode])

  const flushPendingWidth = useCallback((): number => {
    if (resizeFrameRef.current !== null) {
      cancelAnimationFrame(resizeFrameRef.current)
      resizeFrameRef.current = null
    }

    const pendingWidth = pendingWidthRef.current
    pendingWidthRef.current = null
    return pendingWidth === null ? widthRef.current : applyWidth(pendingWidth)
  }, [applyWidth])

  const restoreDocumentInteraction = useCallback((): void => {
    const styles = documentStylesRef.current
    if (!styles) return

    document.documentElement.style.cursor = styles.documentCursor
    document.documentElement.style.userSelect = styles.documentUserSelect
    document.body.style.cursor = styles.bodyCursor
    document.body.style.userSelect = styles.bodyUserSelect
    documentStylesRef.current = null
  }, [])

  const finishPointerDrag = useCallback((
    pointerId: number,
    commitPreference: boolean
  ): void => {
    const drag = pointerDragRef.current
    if (!drag || drag.pointerId !== pointerId) return

    const width = flushPendingWidth()
    if (commitPreference) {
      sidePanelWidthPreferences.set(preferenceKey, width)
    }

    pointerDragRef.current = null
    releaseCapturedPointer(separatorRef.current, pointerId)
    restoreDocumentInteraction()
    restoreTransitionAfterResize()
  }, [
    flushPendingWidth,
    preferenceKey,
    restoreDocumentInteraction,
    restoreTransitionAfterResize
  ])

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return

    const updateForContainerWidth = (
      containerWidth: number,
      suspendTransition: boolean
    ): void => {
      if (suspendTransition) {
        suspendTransitionForDirectWidth()
      }
      const nextLayoutMode = getSidePanelLayoutMode(containerWidth)
      setLayoutMode(nextLayoutMode)
      boundsRef.current = getSidePanelWidthBounds(containerWidth)
      const preferredWidth = sidePanelWidthPreferences.get(preferenceKey)
      const defaultWidth = containerWidth * (
        nextLayoutMode === 'overlay'
          ? DEFAULT_OVERLAY_PANEL_RATIO
          : DEFAULT_SIDE_PANEL_RATIO
      )
      applyWidth(preferredWidth ?? defaultWidth)
      if (suspendTransition) {
        restoreTransitionAfterResize()
      }
    }

    updateForContainerWidth(root.getBoundingClientRect().width, false)

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        updateForContainerWidth(entry.contentRect.width, true)
      }
    })
    observer.observe(root)

    return (): void => observer.disconnect()
  }, [
    applyWidth,
    preferenceKey,
    restoreTransitionAfterResize,
    suspendTransitionForDirectWidth
  ])

  useLayoutEffect(() => {
    const sideRegion = sideRegionRef.current
    const aside = asideRef.current
    if (sideRegion) {
      sideRegion.inert = !open
    }
    if (aside) {
      aside.inert = !open
      if (open) {
        aside.style.visibility = 'visible'
      }
    }

    clearKeyboardTransitionTimer()
    if (!pointerDragRef.current) {
      setResizeMode(null)
    }
    if (open) {
      applyWidth(widthRef.current)
    }
  }, [
    applyWidth,
    clearKeyboardTransitionTimer,
    open,
    setResizeMode
  ])

  useMotionValueEvent(progress, 'change', (latest) => {
    const aside = asideRef.current
    if (!aside) return

    if (!openRef.current && latest <= 0.001) {
      aside.style.visibility = 'hidden'
    } else if (latest > 0.001) {
      aside.style.visibility = 'visible'
    }
  })

  useEffect(() => {
    const target = open ? 1 : 0
    const controls = animate(progress, target, shouldReduceMotion
      ? {
          duration: REDUCED_MOTION_OPACITY_DURATION_SECONDS,
          ease: SIDE_PANEL_EASING,
          onComplete: (): void => {
            if (!openRef.current && target === 0) {
              progress.set(0)
              if (asideRef.current) {
                asideRef.current.style.visibility = 'hidden'
              }
            }
          }
        }
      : {
          ...SIDE_PANEL_SPRING,
          onComplete: (): void => {
            if (!openRef.current && target === 0) {
              progress.set(0)
              if (asideRef.current) {
                asideRef.current.style.visibility = 'hidden'
              }
            }
          }
        })

    return (): void => controls.stop()
  }, [open, progress, shouldReduceMotion])

  useEffect(() => {
    if (!open || !onClose) return

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.isComposing || event.keyCode === 229) return

      event.preventDefault()
      event.stopPropagation()
      onClose()
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return (): void => document.removeEventListener('keydown', handleKeyDown, true)
  }, [onClose, open])

  useEffect(() => {
    return (): void => {
      const drag = pointerDragRef.current
      if (drag) {
        const width = flushPendingWidth()
        sidePanelWidthPreferences.set(preferenceKey, width)
        const separator = separatorRef.current
        pointerDragRef.current = null
        releaseCapturedPointer(separator, drag.pointerId)
      } else if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current)
        resizeFrameRef.current = null
      }

      clearKeyboardTransitionTimer()
      clearKeyboardWidthAnimation()
      clearResizeTransitionFrame()
      pendingWidthRef.current = null
      restoreDocumentInteraction()
      setResizeMode(null)
    }
  }, [
    clearKeyboardTransitionTimer,
    clearKeyboardWidthAnimation,
    clearResizeTransitionFrame,
    flushPendingWidth,
    preferenceKey,
    restoreDocumentInteraction,
    setResizeMode
  ])

  useEffect(() => {
    const drag = pointerDragRef.current
    if (!open && drag) {
      finishPointerDrag(drag.pointerId, true)
    }
  }, [finishPointerDrag, open])

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || pointerDragRef.current || !open) return

    suspendTransitionForDirectWidth()
    event.currentTarget.setPointerCapture(event.pointerId)
    pointerDragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startWidth: widthRef.current
    }
    documentStylesRef.current = {
      documentCursor: document.documentElement.style.cursor,
      documentUserSelect: document.documentElement.style.userSelect,
      bodyCursor: document.body.style.cursor,
      bodyUserSelect: document.body.style.userSelect
    }
    document.documentElement.style.cursor = 'col-resize'
    document.documentElement.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    event.preventDefault()
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = pointerDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    pendingWidthRef.current = clampSidePanelWidth(
      drag.startWidth + drag.startClientX - event.clientX,
      boundsRef.current
    )
    if (resizeFrameRef.current === null) {
      resizeFrameRef.current = requestAnimationFrame(() => {
        resizeFrameRef.current = null
        const pendingWidth = pendingWidthRef.current
        pendingWidthRef.current = null
        if (pendingWidth !== null) {
          applyWidth(pendingWidth)
        }
      })
    }
    event.preventDefault()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    let nextWidth: number | null = null

    switch (event.key) {
      case 'ArrowLeft':
        nextWidth = widthRef.current + KEYBOARD_RESIZE_STEP_PX
        break
      case 'ArrowRight':
        nextWidth = widthRef.current - KEYBOARD_RESIZE_STEP_PX
        break
      case 'Home':
        nextWidth = boundsRef.current.min
        break
      case 'End':
        nextWidth = boundsRef.current.max
        break
      default:
        return
    }

    event.preventDefault()
    clearResizeTransitionFrame()
    clearKeyboardTransitionTimer()
    setResizeMode('keyboard')
    const width = applyWidth(nextWidth, true)
    sidePanelWidthPreferences.set(preferenceKey, width)
    keyboardTransitionTimerRef.current = window.setTimeout(() => {
      keyboardTransitionTimerRef.current = null
      setResizeMode(null)
    }, KEYBOARD_RESIZE_FEEDBACK_MS)
  }

  return (
    <div
      ref={rootRef}
      className={cn('relative flex h-full min-h-0 w-full min-w-0 overflow-hidden', className)}
      data-side-panel-layout=""
      data-layout-mode={layoutMode}
    >
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>

      <motion.div
        ref={separatorRef}
        role="separator"
        aria-label={`Resize ${sidePanelLabel}`}
        aria-controls={sidePanelId}
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={0}
        aria-valuenow={0}
        aria-hidden={!open}
        tabIndex={open ? 0 : -1}
        data-state={open ? 'open' : 'closed'}
        data-layout-mode={layoutMode}
        className={cn(
          'z-30 w-3 shrink-0 touch-none cursor-col-resize rounded-sm',
          layoutMode === 'overlay'
            ? 'absolute inset-y-0'
            : 'relative -mx-1.5',
          'transition-[background-color,opacity] duration-150 focus-visible:outline-hidden motion-reduce:duration-100',
          'data-[state=open]:pointer-events-auto data-[state=open]:opacity-100',
          'data-[state=closed]:pointer-events-none data-[state=closed]:opacity-0',
          'hover:bg-primary/[0.06] focus-visible:bg-primary/[0.10] active:bg-primary/[0.12]'
        )}
        style={layoutMode === 'overlay' ? { right: separatorOverlayRight } : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finishPointerDrag(event.pointerId, true)}
        onPointerCancel={(event) => finishPointerDrag(event.pointerId, true)}
        onLostPointerCapture={(event) => finishPointerDrag(event.pointerId, true)}
        onKeyDown={handleKeyDown}
      />

      <motion.div
        ref={sideRegionRef}
        data-side-panel-region=""
        data-state={open ? 'open' : 'closed'}
        data-layout-mode={layoutMode}
        aria-hidden={!open}
        className={cn(
          'h-full min-w-0 shrink-0 overflow-hidden',
          'data-[state=closed]:pointer-events-none',
          layoutMode === 'overlay'
            ? 'absolute inset-y-0 right-0 z-20'
            : 'relative'
        )}
        style={{
          width: layoutMode === 'overlay'
            ? overlayRegionWidth
            : shouldReduceMotion
              ? open
                ? widthRef.current + SIDE_PANEL_GUTTER_PX
                : '0px'
              : structuralWidth
        }}
      >
        <motion.aside
          ref={asideRef}
          id={sidePanelId}
          aria-label={sidePanelLabel}
          aria-hidden={!open}
          data-side-panel-content=""
          data-state={open ? 'open' : 'closed'}
          className="absolute inset-y-0 right-2 h-full overflow-hidden contain-layout contain-paint"
          style={{
            opacity: contentOpacity,
            transform: contentTransform,
            visibility: open || progress.get() > 0.001 ? 'visible' : 'hidden',
            width: panelWidth
          }}
        >
          {sidePanel}
        </motion.aside>
      </motion.div>
    </div>
  )
}

export default ChatSidePanelLayout

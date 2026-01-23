import { cn } from '@renderer/lib/utils'
import { getCaretCoordinates } from '@renderer/utils/caret-coords'
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import './styles/custom-caret.css'

export interface CustomCaretRef {
  updateCaret: (forceVisible?: boolean) => void
  hideCaret: () => void
  showCaret: () => void
  setBackspace: (isBackspace: boolean) => void
}

interface CustomCaretOverlayProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
}

interface TrailNode {
  root: HTMLDivElement
  inner: HTMLDivElement
  animation: Animation | null
  busy: boolean
}

// Configuration constants
const CARET_CONFIG = {
  // Trail trigger thresholds
  TRAIL_MIN_HORIZONTAL_DISTANCE: 2,      // px - minimum horizontal movement to create trail
  TRAIL_MAX_VERTICAL_DIFF: 5,            // px - maximum vertical difference for same-line detection

  // Animation timings
  TRAIL_ANIMATION_DURATION: 300,         // ms
  CARET_BREATHE_DURATION: 1500,          // ms (matches CSS animation)

  // Visual adjustments
  CARET_HEIGHT_OFFSET: 4,                // px - added to fontSize for caret height
  CARET_HEIGHT_FINAL_ADJUSTMENT: 1.25,   // px - final height adjustment
  CARET_VERTICAL_OFFSET: -2.5,           // px - vertical centering adjustment

  // Performance
  RESIZE_THROTTLE_MS: 100,               // ms - resize event throttle

  // Trail visual
  TRAIL_WIDTH_PADDING: 2,                // px - extra width for trail
  TRAIL_POOL_SIZE: 8                     // max number of reusable trail elements
} as const

export type CaretConfig = typeof CARET_CONFIG

export const CustomCaretOverlay = forwardRef<CustomCaretRef, CustomCaretOverlayProps>(({ textareaRef }, ref) => {
  const caretRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const trailContainerRef = useRef<HTMLDivElement>(null)

  const lastCaretPos = useRef<{ top: number, left: number } | null>(null)
  const isBackspaceRef = useRef(false)
  const isFocusedRef = useRef(false)
  const isWindowFocusedRef = useRef(true)
  const measurementsRef = useRef<{ textareaRect: DOMRect; overlayRect: DOMRect } | null>(null)
  const measurementsDirtyRef = useRef(true)
  const rafIdRef = useRef<number | null>(null)
  const needsUpdateRef = useRef(false)
  const trailPoolRef = useRef<TrailNode[]>([])

  const setOverlayVisibility = useCallback((visible: boolean) => {
    const overlay = overlayRef.current
    if (!overlay) return
    overlay.style.opacity = visible ? '1' : '0'
    overlay.style.visibility = visible ? 'visible' : 'hidden'
  }, [])

  const markMeasurementsDirty = useCallback(() => {
    measurementsDirtyRef.current = true
  }, [])

  const refreshMeasurements = useCallback(() => {
    const textarea = textareaRef.current
    const overlay = overlayRef.current

    if (!textarea || !overlay) {
      measurementsRef.current = null
      measurementsDirtyRef.current = true
      return
    }

    measurementsRef.current = {
      textareaRect: textarea.getBoundingClientRect(),
      overlayRect: overlay.getBoundingClientRect()
    }
    measurementsDirtyRef.current = false
  }, [textareaRef])

  const hideCaretElement = useCallback(() => {
    const caret = caretRef.current
    if (caret) {
      caret.style.opacity = '0'
    }
    setOverlayVisibility(false)
  }, [setOverlayVisibility])

  const applyCaretPosition = useCallback((left: number, top: number, height: number) => {
    const caret = caretRef.current
    if (!caret) return
    setOverlayVisibility(true)

    caret.style.transform = `translate3d(${left}px, ${top}px, 0)`
    caret.style.height = `${height}px`
    caret.style.opacity = '1'
  }, [setOverlayVisibility])

  const acquireTrailNode = useCallback((container: HTMLDivElement): TrailNode | null => {
    let node = trailPoolRef.current.find(n => !n.busy)

    if (!node) {
      if (trailPoolRef.current.length < CARET_CONFIG.TRAIL_POOL_SIZE) {
        const root = document.createElement('div')
        root.className = "pointer-events-none absolute rounded-md z-10"
        root.style.opacity = '0'
        root.style.willChange = 'transform, opacity'

        const inner = document.createElement('div')
        inner.className = "w-full h-full rounded-md"
        root.appendChild(inner)

        container.appendChild(root)
        node = { root, inner, animation: null, busy: false }
        trailPoolRef.current.push(node)
      } else {
        node = trailPoolRef.current[0]
        if (node.animation) {
          node.animation.cancel()
        }
        node.busy = false
      }
    }

    if (node && node.root.parentElement !== container) {
      container.appendChild(node.root)
    }

    return node ?? null
  }, [])

  const createTrail = useCallback((x: number, y: number, width: number, height: number, isDelete: boolean, direction: number) => {
    const trailRoot = trailContainerRef.current
    if (!trailRoot) return

    const node = acquireTrailNode(trailRoot)
    if (!node) return

    if (node.animation) {
      node.animation.cancel()
    }

    node.busy = true
    node.root.style.transform = `translate3d(${x}px, ${y}px, 0)`
    node.root.style.width = `${width}px`
    node.root.style.height = `${height}px`
    node.root.style.opacity = '1'

    node.inner.className = cn(
      "w-full h-full rounded-md",
      isDelete
        ? "shadow-[0_0_8px_rgba(239,68,68,0.4)]"
        : "shadow-[0_0_5px_rgba(96,165,250,0.3)]"
    )
    const startAlpha = 0.05
    const endAlpha = isDelete ? 0.45 : 0.35
    const startColor = isDelete ? `rgba(248,113,113,${startAlpha})` : `rgba(59,130,246,${startAlpha})`
    const endColor = isDelete ? `rgba(220,38,38,${endAlpha})` : `rgba(59,130,246,${endAlpha})`
    const gradientDirection = direction >= 0 ? 'to right' : 'to left'
    node.inner.style.background = `linear-gradient(${gradientDirection}, ${startColor} 0%, ${endColor} 80%)`

    const animation = node.inner.animate(
      [
        { opacity: 1, transform: 'scaleX(1)' },
        { opacity: 0, transform: 'scaleX(0.95)' }
      ],
      {
        duration: CARET_CONFIG.TRAIL_ANIMATION_DURATION,
        easing: 'ease-out',
        fill: 'forwards'
      }
    )

    const complete = () => {
      node.busy = false
      node.root.style.opacity = '0'
      node.animation = null
    }

    animation.onfinish = complete
    animation.oncancel = complete
    node.animation = animation
  }, [acquireTrailNode])

  const performUpdate = useCallback(() => {
    const textarea = textareaRef.current
    const overlay = overlayRef.current

    if (!textarea || !overlay) return

    if (!isFocusedRef.current || !isWindowFocusedRef.current || document.activeElement !== textarea) {
      hideCaretElement()
      return
    }

    const selectionStart = textarea.selectionStart ?? 0
    const selectionEnd = textarea.selectionEnd ?? 0
    const valueLength = textarea.value.length

    if (selectionStart !== selectionEnd) {
      hideCaretElement()
      return
    }

    const coords = getCaretCoordinates(textarea, selectionEnd)

    if (!measurementsRef.current || measurementsDirtyRef.current) {
      refreshMeasurements()
    }
    const measurements = measurementsRef.current
    if (!measurements) return

    const { textareaRect, overlayRect } = measurements

    const caretViewportLeft = textareaRect.left + coords.left - textarea.scrollLeft
    const caretViewportTop = textareaRect.top + coords.top - textarea.scrollTop

    const relativeLeft = caretViewportLeft - overlayRect.left
    const relativeTop = caretViewportTop - overlayRect.top

    const caretHeight = coords.fontSize + CARET_CONFIG.CARET_HEIGHT_OFFSET
    const verticalOffset = (coords.height - caretHeight) / 2
    const finalTop = relativeTop + verticalOffset + CARET_CONFIG.CARET_VERTICAL_OFFSET
    const finalLeft = relativeLeft
    const finalHeight = caretHeight + CARET_CONFIG.CARET_HEIGHT_FINAL_ADJUSTMENT

    applyCaretPosition(finalLeft, finalTop, finalHeight)

    if (lastCaretPos.current) {
      const prev = lastCaretPos.current
      const direction = Math.sign(finalLeft - prev.left) || 1
      if (Math.abs(prev.top - finalTop) < CARET_CONFIG.TRAIL_MAX_VERTICAL_DIFF &&
          Math.abs(prev.left - finalLeft) > CARET_CONFIG.TRAIL_MIN_HORIZONTAL_DISTANCE) {
        const trailX = Math.min(prev.left, finalLeft)
        const width = Math.abs(prev.left - finalLeft) + CARET_CONFIG.TRAIL_WIDTH_PADDING
        createTrail(trailX, finalTop, width, finalHeight, isBackspaceRef.current, direction)
      }
    }

    lastCaretPos.current = { top: finalTop, left: finalLeft }
    isBackspaceRef.current = false
  }, [textareaRef, hideCaretElement, applyCaretPosition, createTrail, refreshMeasurements])

  const scheduleCaretUpdate = useCallback(() => {
    needsUpdateRef.current = true
    if (rafIdRef.current !== null) return

    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null
      if (!needsUpdateRef.current) return
      needsUpdateRef.current = false
      performUpdate()
      if (needsUpdateRef.current) {
        scheduleCaretUpdate()
      }
    })
  }, [performUpdate])

  const updateCaret = useCallback((forceRecalc?: boolean) => {
    if (forceRecalc) {
      markMeasurementsDirty()
    }
    scheduleCaretUpdate()
  }, [markMeasurementsDirty, scheduleCaretUpdate])

  const showCaret = useCallback(() => {
    isFocusedRef.current = true
    setOverlayVisibility(true)
    markMeasurementsDirty()
    updateCaret()
  }, [updateCaret, setOverlayVisibility, markMeasurementsDirty])

  const hideCaret = useCallback(() => {
    isFocusedRef.current = false
    hideCaretElement()
  }, [hideCaretElement])

  useImperativeHandle(ref, () => ({
    updateCaret,
    showCaret,
    hideCaret,
    setBackspace: (val: boolean) => { isBackspaceRef.current = val }
  }))

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    const handleFocus = () => {
      isFocusedRef.current = true
      setOverlayVisibility(true)
      markMeasurementsDirty()
      requestAnimationFrame(() => {
        updateCaret()
      })
    }

    const handleBlur = () => {
      isFocusedRef.current = false
      hideCaretElement()
    }

    const handleInput = () => {
      if (isFocusedRef.current) {
        updateCaret()
      }
    }

    const handleScroll = () => {
      if (isFocusedRef.current) {
        updateCaret()
      }
    }

    const handleClick = () => {
      if (isFocusedRef.current || document.activeElement === textareaRef.current) {
        updateCaret()
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        isBackspaceRef.current = (e.key === 'Backspace')
      }

      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab'].includes(e.key)) {
        return
      }
    }

    textarea.addEventListener('focus', handleFocus)
    textarea.addEventListener('blur', handleBlur)
    textarea.addEventListener('input', handleInput)
    textarea.addEventListener('scroll', handleScroll, { passive: true })
    textarea.addEventListener('click', handleClick)
    textarea.addEventListener('keydown', handleKeyDown)

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      needsUpdateRef.current = false

      textarea.removeEventListener('focus', handleFocus)
      textarea.removeEventListener('blur-sm', handleBlur)
      textarea.removeEventListener('input', handleInput)
      textarea.removeEventListener('scroll', handleScroll, { passive: true } as any)
      textarea.removeEventListener('click', handleClick)
      textarea.removeEventListener('keydown', handleKeyDown)
    }
  }, [textareaRef, updateCaret, hideCaretElement, markMeasurementsDirty])

  useEffect(() => {
    const handleSelectionChange = () => {
      if (isFocusedRef.current && document.activeElement === textareaRef.current) {
        updateCaret()
      } else if (isFocusedRef.current) {
        hideCaretElement()
      }
    }

    const handleWindowBlur = () => {
      isWindowFocusedRef.current = false
      hideCaretElement()
    }

    const handleWindowFocus = () => {
      isWindowFocusedRef.current = true
      if (isFocusedRef.current && document.activeElement === textareaRef.current) {
        updateCaret()
      }
    }

    let resizeTimeout: number | null = null
    const handleResize = () => {
      if (resizeTimeout) return
      resizeTimeout = window.setTimeout(() => {
        resizeTimeout = null
        if (isFocusedRef.current) {
          markMeasurementsDirty()
          updateCaret()
        }
      }, CARET_CONFIG.RESIZE_THROTTLE_MS)
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    window.addEventListener('resize', handleResize)
    window.addEventListener('blur', handleWindowBlur)
    window.addEventListener('focus', handleWindowFocus)

    return () => {
      if (resizeTimeout) clearTimeout(resizeTimeout)
      document.removeEventListener('selectionchange', handleSelectionChange)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('blur-sm', handleWindowBlur)
      window.removeEventListener('focus', handleWindowFocus)
    }
  }, [updateCaret, hideCaretElement, textareaRef, markMeasurementsDirty])

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return
    const textarea = textareaRef.current
    const overlay = overlayRef.current
    if (!textarea || !overlay) return

    const observer = new ResizeObserver(() => {
      markMeasurementsDirty()
      if (isFocusedRef.current) {
        scheduleCaretUpdate()
      }
    })

    observer.observe(textarea)
    observer.observe(overlay)

    return () => {
      observer.disconnect()
    }
  }, [textareaRef, markMeasurementsDirty, scheduleCaretUpdate])

  return (
    <div
      ref={overlayRef}
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ opacity: 0, visibility: 'hidden', transition: 'opacity 0.08s ease' }}
    >
      <div ref={trailContainerRef} className="pointer-events-none absolute inset-0 overflow-visible" />

      <div
        ref={caretRef}
        className="custom-caret pointer-events-none absolute w-[3px] bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.6)] z-10 animate-caret-breathe"
        style={{
          opacity: 0,
          transform: 'translate3d(0, 0, 0)',
          transition: 'transform 0.12s cubic-bezier(0.2, 0, 0, 1), height 0.1s ease, opacity 0.08s ease'
        }}
      >
        <div className="absolute top-0 bottom-0 -left-px w-[6px] bg-blue-400/20 blur-[2px] rounded-full" />
      </div>
    </div>
  )
})

CustomCaretOverlay.displayName = 'CustomCaretOverlay'

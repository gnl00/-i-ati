import { cn } from '@renderer/lib/utils'
import { getCaretCoordinates } from '@renderer/utils/caret-coords'
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react'

export interface CustomCaretRef {
  updateCaret: (forceVisible?: boolean) => void
  hideCaret: () => void
  showCaret: () => void
  setBackspace: (isBackspace: boolean) => void
}

interface CustomCaretOverlayProps {
  textareaRef: React.RefObject<HTMLTextAreaElement>
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
  const updateTimeoutRef = useRef<number | null>(null)

  const setOverlayVisibility = useCallback((visible: boolean) => {
    const overlay = overlayRef.current
    if (!overlay) return
    overlay.style.opacity = visible ? '1' : '0'
    overlay.style.visibility = visible ? 'visible' : 'hidden'
  }, [])

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
  }, [])

  const createTrail = useCallback((x: number, y: number, width: number, height: number, isDelete: boolean) => {
    const trailRoot = trailContainerRef.current
    if (!trailRoot) return

    const trail = document.createElement('div')
    trail.className = "pointer-events-none absolute rounded-md z-10"
    trail.style.transform = `translate3d(${x}px, ${y}px, 0)`
    trail.style.width = `${width}px`
    trail.style.height = `${height}px`

    const inner = document.createElement('div')
    inner.className = cn(
      "w-full h-full rounded-md",
      isDelete
        ? "bg-red-500/30 shadow-[0_0_8px_rgba(239,68,68,0.4)]"
        : "bg-blue-400/20 shadow-[0_0_5px_rgba(96,165,250,0.3)]"
    )
    trail.appendChild(inner)
    trailRoot.appendChild(trail)

    const animation = inner.animate(
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

    animation.onfinish = () => {
      trail.remove()
    }
  }, [])

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

    console.log('[CustomCaret] getCaretCoordinates result:', {
      ...coords,
      selectionStart,
      selectionEnd,
      textLength: valueLength,
      textValue: textarea.value,
      scrollTop: textarea.scrollTop,
      scrollLeft: textarea.scrollLeft
    })

    if (valueLength > 0 && selectionEnd === 0 && lastCaretPos.current) {
      console.log('[CustomCaret] Skipping update - cursor at 0 but text exists')
      return
    }

    const textareaRect = textarea.getBoundingClientRect()
    const overlayRect = overlay.getBoundingClientRect()

    const caretViewportLeft = textareaRect.left + coords.left - textarea.scrollLeft
    const caretViewportTop = textareaRect.top + coords.top - textarea.scrollTop

    const relativeLeft = caretViewportLeft - overlayRect.left
    const relativeTop = caretViewportTop - overlayRect.top

    const caretHeight = coords.fontSize + CARET_CONFIG.CARET_HEIGHT_OFFSET
    const verticalOffset = (coords.height - caretHeight) / 2
    const finalTop = relativeTop + verticalOffset + CARET_CONFIG.CARET_VERTICAL_OFFSET
    const finalLeft = relativeLeft
    const finalHeight = caretHeight + CARET_CONFIG.CARET_HEIGHT_FINAL_ADJUSTMENT

    console.log('[CustomCaret] Final position:', { finalLeft, finalTop, caretHeight: finalHeight })

    applyCaretPosition(finalLeft, finalTop, finalHeight)

    if (lastCaretPos.current) {
      const prev = lastCaretPos.current
      if (Math.abs(prev.top - finalTop) < CARET_CONFIG.TRAIL_MAX_VERTICAL_DIFF &&
          Math.abs(prev.left - finalLeft) > CARET_CONFIG.TRAIL_MIN_HORIZONTAL_DISTANCE) {
        const trailX = Math.min(prev.left, finalLeft)
        const width = Math.abs(prev.left - finalLeft) + CARET_CONFIG.TRAIL_WIDTH_PADDING
        createTrail(trailX, finalTop, width, finalHeight, isBackspaceRef.current)
      }
    }

    lastCaretPos.current = { top: finalTop, left: finalLeft }
    isBackspaceRef.current = false
  }, [textareaRef, hideCaretElement, applyCaretPosition, createTrail])

  const updateCaret = useCallback(() => {
    if (updateTimeoutRef.current !== null) {
      cancelAnimationFrame(updateTimeoutRef.current)
    }

    updateTimeoutRef.current = requestAnimationFrame(() => {
      updateTimeoutRef.current = null
      performUpdate()
    })
  }, [performUpdate])

  const showCaret = useCallback(() => {
    isFocusedRef.current = true
    setOverlayVisibility(true)
    updateCaret()
  }, [updateCaret, setOverlayVisibility])

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
      if (updateTimeoutRef.current !== null) {
        cancelAnimationFrame(updateTimeoutRef.current)
      }

      textarea.removeEventListener('focus', handleFocus)
      textarea.removeEventListener('blur', handleBlur)
      textarea.removeEventListener('input', handleInput)
      textarea.removeEventListener('scroll', handleScroll, { passive: true } as any)
      textarea.removeEventListener('click', handleClick)
      textarea.removeEventListener('keydown', handleKeyDown)
    }
  }, [textareaRef, updateCaret, hideCaretElement])

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
      window.removeEventListener('blur', handleWindowBlur)
      window.removeEventListener('focus', handleWindowFocus)
    }
  }, [updateCaret, hideCaretElement, textareaRef])

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
        <div className="absolute top-0 bottom-0 -left-[1px] w-[6px] bg-blue-400/20 blur-[2px] rounded-full" />
      </div>
    </div>
  )
})

CustomCaretOverlay.displayName = 'CustomCaretOverlay'

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
  const caretElRef = useRef<HTMLDivElement>(null)
  const trailContainerRef = useRef<HTMLDivElement>(null)

  // Internal state refs
  const lastCaretPos = useRef<{ top: number, left: number } | null>(null)
  const isBackspaceRef = useRef(false)
  const updateScheduled = useRef(false)
  const isFocusedRef = useRef(false) // Strict focus tracking
  const isWindowFocusedRef = useRef(true) // Track window focus state

  const performUpdate = useCallback(() => {
    updateScheduled.current = false
    const textarea = textareaRef.current
    const caretEl = caretElRef.current

    if (!textarea || !caretEl) return

    // Strict Visibility Check:
    // 1. Must be flagged as focused via onFocus
    // 2. Window must have focus
    // 3. document.activeElement must match (double check)
    if (!isFocusedRef.current || !isWindowFocusedRef.current || document.activeElement !== textarea) {
      caretEl.style.visibility = 'hidden'
      caretEl.style.animationPlayState = 'paused'
      return
    }

    // Check if there's a selection range - hide caret when text is selected
    if (textarea.selectionStart !== textarea.selectionEnd) {
      caretEl.style.visibility = 'hidden'
      caretEl.style.animationPlayState = 'paused'
      return
    }

    const { top, left, height, fontSize } = getCaretCoordinates(textarea, textarea.selectionEnd)

    // Adjust for scroll
    const adjustedTop = top - textarea.scrollTop
    const adjustedLeft = left - textarea.scrollLeft

    // Center the caret vertically relative to the line height
    const caretHeight = fontSize + CARET_CONFIG.CARET_HEIGHT_OFFSET
    const verticalOffset = (height - caretHeight) / 2
    const finalTop = adjustedTop + verticalOffset + CARET_CONFIG.CARET_VERTICAL_OFFSET
    const finalLeft = adjustedLeft

    // Update Caret Position using CSS variables
    caretEl.style.setProperty('--caret-x', `${finalLeft}px`)
    caretEl.style.setProperty('--caret-y', `${finalTop}px`)
    caretEl.style.setProperty('--caret-height', `${caretHeight + CARET_CONFIG.CARET_HEIGHT_FINAL_ADJUSTMENT}px`)
    caretEl.style.visibility = 'visible'
    caretEl.style.animationPlayState = 'running'

    // Motion Trail Logic
    if (lastCaretPos.current && trailContainerRef.current) {
      const prev = lastCaretPos.current
      // Only trail if moved significantly horizontally and on roughly the same line
      if (Math.abs(prev.top - finalTop) < CARET_CONFIG.TRAIL_MAX_VERTICAL_DIFF &&
          Math.abs(prev.left - finalLeft) > CARET_CONFIG.TRAIL_MIN_HORIZONTAL_DISTANCE) {
         createTrail(
             Math.min(prev.left, finalLeft),
             finalTop,
             Math.abs(prev.left - finalLeft) + CARET_CONFIG.TRAIL_WIDTH_PADDING,
             caretHeight,
             isBackspaceRef.current
         )
      }
    }

    lastCaretPos.current = { top: finalTop, left: finalLeft }
    isBackspaceRef.current = false // Reset backspace flag after update
  }, [textareaRef])

  const createTrail = (x: number, y: number, w: number, h: number, isDelete: boolean) => {
    if (!trailContainerRef.current) return

    const trail = document.createElement('div')
    trail.className = "pointer-events-none absolute rounded-md z-10"
    trail.style.top = '0px'
    trail.style.left = '0px'
    trail.style.transform = `translate(${x}px, ${y}px)`
    trail.style.width = `${w}px`
    trail.style.height = `${h}px`

    const inner = document.createElement('div')
    inner.className = cn(
        "w-full h-full rounded-md",
        isDelete ? "bg-red-500/30 shadow-[0_0_8px_rgba(239,68,68,0.4)]" : "bg-blue-400/20 shadow-[0_0_5px_rgba(96,165,250,0.3)]"
    )
    trail.appendChild(inner)

    trailContainerRef.current.appendChild(trail)

    // Use Web Animations API instead of CSS class + setTimeout
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

    // Clean up when animation completes
    animation.onfinish = () => {
        if (trailContainerRef.current && trail.parentNode === trailContainerRef.current) {
            trailContainerRef.current.removeChild(trail)
        }
    }
  }

  const updateCaret = useCallback(() => {
    if (updateScheduled.current) return
    updateScheduled.current = true
    requestAnimationFrame(performUpdate)
  }, [performUpdate])

  const showCaret = useCallback(() => {
    isFocusedRef.current = true
    updateCaret()
  }, [updateCaret])

  const hideCaret = useCallback(() => {
    isFocusedRef.current = false
    if (caretElRef.current) {
      caretElRef.current.style.visibility = 'hidden'
      caretElRef.current.style.animationPlayState = 'paused'
    }
  }, [])

  useImperativeHandle(ref, () => ({
    updateCaret,
    showCaret,
    hideCaret,
    setBackspace: (val: boolean) => { isBackspaceRef.current = val }
  }))

  // Attach native event listeners to the textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    const handleFocus = () => {
      isFocusedRef.current = true
      // Use requestAnimationFrame to ensure layout is complete
      requestAnimationFrame(() => {
        updateCaret()
      })
    }

    const handleBlur = () => {
      isFocusedRef.current = false
      if (caretElRef.current) {
        caretElRef.current.style.visibility = 'hidden'
        caretElRef.current.style.animationPlayState = 'paused'
      }
    }

    const handleInput = () => {
        // Input only happens when focused, but check to be safe
        if (isFocusedRef.current) {
            updateCaret()
        }
    }

    const handleScroll = () => {
        // Only update caret position if textarea is focused
        if (isFocusedRef.current) {
            updateCaret()
        }
    }

    const handleClick = () => {
        // Click might happen before focus event, performUpdate will handle the check
        // But we still check here to avoid unnecessary updates
        if (isFocusedRef.current || document.activeElement === textareaRef.current) {
            updateCaret()
        }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Backspace' || e.key === 'Delete') {
            isBackspaceRef.current = (e.key === 'Backspace')
        }
        // Skip update for modifier keys that don't move cursor
        if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' ||
            e.key === 'Meta' || e.key === 'CapsLock' || e.key === 'Tab') {
            return
        }
        // input event will handle the update for text input
        // arrow keys and other navigation will trigger selectionchange
    }

    textarea.addEventListener('focus', handleFocus)
    textarea.addEventListener('blur', handleBlur)
    textarea.addEventListener('input', handleInput)
    textarea.addEventListener('scroll', handleScroll, { passive: true })
    textarea.addEventListener('click', handleClick)
    textarea.addEventListener('keydown', handleKeyDown)

    return () => {
      textarea.removeEventListener('focus', handleFocus)
      textarea.removeEventListener('blur', handleBlur)
      textarea.removeEventListener('input', handleInput)
      textarea.removeEventListener('scroll', handleScroll, { passive: true } as any)
      textarea.removeEventListener('click', handleClick)
      textarea.removeEventListener('keydown', handleKeyDown)
    }
  }, [textareaRef, updateCaret])

  useEffect(() => {
    const handleSelectionChange = () => {
      // Only react to selection change if we believe we are focused
      if (isFocusedRef.current && document.activeElement === textareaRef.current) {
        updateCaret()
      } else if (isFocusedRef.current && document.activeElement !== textareaRef.current) {
        // If we thought we were focused but aren't anymore (e.g. window blur), hide
        hideCaret()
      }
    }

    const handleWindowBlur = () => {
      isWindowFocusedRef.current = false
      hideCaret()
    }

    const handleWindowFocus = () => {
      isWindowFocusedRef.current = true
      // Only show if textarea is still focused AND was previously focused by user interaction
      if (isFocusedRef.current && document.activeElement === textareaRef.current) {
        updateCaret()
      }
    }

    // Throttle resize event
    let resizeTimeout: number | null = null
    const handleResize = () => {
      if (resizeTimeout) return
      resizeTimeout = window.setTimeout(() => {
        resizeTimeout = null
        // Only update if textarea is focused
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
  }, [updateCaret, hideCaret, textareaRef])

  return (
    <>
        {/* Trail Container */}
        <div ref={trailContainerRef} className="pointer-events-none absolute inset-0 overflow-hidden" />
        
        {/* Caret Element */}
        <div
            ref={caretElRef}
            className="custom-caret pointer-events-none absolute w-[3px] bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.6)] z-10 animate-caret-breathe"
            style={{
                top: 0,
                left: 0,
                visibility: 'hidden', // Hidden by default
                animationPlayState: 'paused', // Animation paused by default
                transition: 'transform 0.1s cubic-bezier(0.2, 0, 0, 1), height 0.1s ease',
            }}
        >
            <div className="absolute top-0 bottom-0 -left-[1px] w-[6px] bg-blue-400/20 blur-[2px] rounded-full" />
        </div>
    </>
  )
})

CustomCaretOverlay.displayName = 'CustomCaretOverlay'
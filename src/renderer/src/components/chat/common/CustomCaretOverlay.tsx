import { cn } from '@renderer/lib/utils'
import { getCaretCoordinates } from '@renderer/utils/caret-coords'
import { useSpring, animated, useTransition, to } from '@react-spring/web'
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'

export interface CustomCaretRef {
  updateCaret: (forceVisible?: boolean) => void
  hideCaret: () => void
  showCaret: () => void
  setBackspace: (isBackspace: boolean) => void
}

interface CustomCaretOverlayProps {
  textareaRef: React.RefObject<HTMLTextAreaElement>
}

interface TrailItem {
  id: number
  x: number
  y: number
  width: number
  height: number
  isDelete: boolean
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
  // Trail state for react-spring transitions
  const [trails, setTrails] = useState<TrailItem[]>([])
  const trailIdCounter = useRef(0)

  // Internal state refs
  const lastCaretPos = useRef<{ top: number, left: number } | null>(null)
  const isBackspaceRef = useRef(false)
  const isFocusedRef = useRef(false)
  const isWindowFocusedRef = useRef(true)
  const updateTimeoutRef = useRef<number | null>(null)

  // React-spring animation for caret position
  const [caretSpring, caretApi] = useSpring(() => ({
    x: 0,
    y: 0,
    height: 20,
    opacity: 0,
    config: { tension: 300, friction: 26 },
    immediate: false
  }))

  const performUpdate = useCallback(() => {
    const textarea = textareaRef.current

    if (!textarea) return

    // Strict Visibility Check
    if (!isFocusedRef.current || !isWindowFocusedRef.current || document.activeElement !== textarea) {
      caretApi.start({ opacity: 0, immediate: true })
      return
    }

    // Check if there's a selection range - hide caret when text is selected
    if (textarea.selectionStart !== textarea.selectionEnd) {
      caretApi.start({ opacity: 0, immediate: true })
      return
    }

    const { top, left, height, fontSize } = getCaretCoordinates(textarea, textarea.selectionEnd)

    console.log('[CustomCaret] getCaretCoordinates result:', {
      top, left, height, fontSize,
      selectionEnd: textarea.selectionEnd,
      selectionStart: textarea.selectionStart,
      textLength: textarea.value.length,
      textValue: textarea.value,
      scrollTop: textarea.scrollTop,
      scrollLeft: textarea.scrollLeft
    })

    // Skip update if cursor position seems incorrect (e.g., at position 0 when there's text)
    // This can happen during React re-renders when the DOM hasn't fully synced yet
    if (textarea.value.length > 0 && textarea.selectionEnd === 0 && lastCaretPos.current) {
      console.log('[CustomCaret] Skipping update - cursor at 0 but text exists')
      return
    }

    // Adjust for scroll
    const adjustedTop = top - textarea.scrollTop
    const adjustedLeft = left - textarea.scrollLeft

    // Center the caret vertically relative to the line height
    const caretHeight = fontSize + CARET_CONFIG.CARET_HEIGHT_OFFSET
    const verticalOffset = (height - caretHeight) / 2
    const finalTop = adjustedTop + verticalOffset + CARET_CONFIG.CARET_VERTICAL_OFFSET
    const finalLeft = adjustedLeft

    console.log('[CustomCaret] Final position:', { finalLeft, finalTop, caretHeight })

    // Update Caret Position using react-spring with immediate position update
    caretApi.start({
      x: finalLeft,
      y: finalTop,
      height: caretHeight + CARET_CONFIG.CARET_HEIGHT_FINAL_ADJUSTMENT,
      opacity: 1,
      immediate: true
    })

    // Motion Trail Logic
    if (lastCaretPos.current) {
      const prev = lastCaretPos.current
      // Only trail if moved significantly horizontally and on roughly the same line
      if (Math.abs(prev.top - finalTop) < CARET_CONFIG.TRAIL_MAX_VERTICAL_DIFF &&
          Math.abs(prev.left - finalLeft) > CARET_CONFIG.TRAIL_MIN_HORIZONTAL_DISTANCE) {
        const newTrail: TrailItem = {
          id: trailIdCounter.current++,
          x: Math.min(prev.left, finalLeft),
          y: finalTop,
          width: Math.abs(prev.left - finalLeft) + CARET_CONFIG.TRAIL_WIDTH_PADDING,
          height: caretHeight,
          isDelete: isBackspaceRef.current
        }
        setTrails(prev => [...prev, newTrail])

        // Auto-remove trail after a short delay to trigger leave animation
        setTimeout(() => {
          setTrails(prev => prev.filter(t => t.id !== newTrail.id))
        }, 50)
      }
    }

    lastCaretPos.current = { top: finalTop, left: finalLeft }
    isBackspaceRef.current = false
  }, [textareaRef, caretApi])

  // Use react-spring transitions for trails
  const trailTransitions = useTransition(trails, {
    keys: (item) => item.id,
    from: { opacity: 0, scaleX: 0.95 },
    enter: { opacity: 1, scaleX: 1 },
    leave: { opacity: 0, scaleX: 0.95 },
    config: { duration: CARET_CONFIG.TRAIL_ANIMATION_DURATION },
    onRest: (result, _spring, item) => {
      // Remove trail from state after leave animation completes
      if (result.value.opacity === 0) {
        setTrails(prev => prev.filter(t => t.id !== item.id))
      }
    }
  })

  const updateCaret = useCallback(() => {
    // Clear any pending update
    if (updateTimeoutRef.current !== null) {
      cancelAnimationFrame(updateTimeoutRef.current)
    }
    // Schedule update for next frame
    updateTimeoutRef.current = requestAnimationFrame(() => {
      updateTimeoutRef.current = null
      performUpdate()
    })
  }, [performUpdate])

  const showCaret = useCallback(() => {
    isFocusedRef.current = true
    updateCaret()
  }, [updateCaret])

  const hideCaret = useCallback(() => {
    isFocusedRef.current = false
    caretApi.start({ opacity: 0 })
  }, [caretApi])

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
      caretApi.start({ opacity: 0 })
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
      {/* Trail Container with react-spring transitions */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {trailTransitions((style, item) => (
          <animated.div
            key={item.id}
            className="pointer-events-none absolute rounded-md z-10"
            style={{
              transform: style.opacity.to(o => `translate(${item.x}px, ${item.y}px)`),
              width: item.width,
              height: item.height,
              opacity: style.opacity
            }}
          >
            <animated.div
              className={cn(
                "w-full h-full rounded-md",
                item.isDelete
                  ? "bg-red-500/30 shadow-[0_0_8px_rgba(239,68,68,0.4)]"
                  : "bg-blue-400/20 shadow-[0_0_5px_rgba(96,165,250,0.3)]"
              )}
              style={{
                transform: style.scaleX.to(s => `scaleX(${s})`)
              }}
            />
          </animated.div>
        ))}
      </div>

      {/* Caret Element with react-spring animation */}
      <animated.div
        className="custom-caret pointer-events-none absolute w-[3px] bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.6)] z-10 animate-caret-breathe"
        style={{
          left: caretSpring.x,
          top: caretSpring.y,
          height: caretSpring.height,
          opacity: caretSpring.opacity,
          willChange: 'transform, opacity'
        }}
      >
        <div className="absolute top-0 bottom-0 -left-[1px] w-[6px] bg-blue-400/20 blur-[2px] rounded-full" />
      </animated.div>
    </>
  )
})

CustomCaretOverlay.displayName = 'CustomCaretOverlay'
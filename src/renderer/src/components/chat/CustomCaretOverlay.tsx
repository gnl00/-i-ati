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

export const CustomCaretOverlay = forwardRef<CustomCaretRef, CustomCaretOverlayProps>(({ textareaRef }, ref) => {
  const caretElRef = useRef<HTMLDivElement>(null)
  const trailContainerRef = useRef<HTMLDivElement>(null)

  // Internal state refs
  const lastCaretPos = useRef<{ top: number, left: number } | null>(null)
  const isBackspaceRef = useRef(false)
  const updateScheduled = useRef(false)
  const isFocusedRef = useRef(false) // Strict focus tracking

  const performUpdate = useCallback(() => {
    updateScheduled.current = false
    const textarea = textareaRef.current
    const caretEl = caretElRef.current
    
    if (!textarea || !caretEl) return

    // Strict Visibility Check:
    // 1. Must be flagged as focused via onFocus
    // 2. document.activeElement must match (double check)
    if (!isFocusedRef.current || document.activeElement !== textarea) {
      caretEl.style.opacity = '0'
      return
    }

    const { top, left, height, fontSize } = getCaretCoordinates(textarea, textarea.selectionEnd)
    
    // Adjust for scroll
    const adjustedTop = top - textarea.scrollTop
    const adjustedLeft = left - textarea.scrollLeft

    // Center the caret vertically relative to the line height
    const caretHeight = fontSize + 4
    const verticalOffset = (height - caretHeight) / 2
    const finalTop = adjustedTop + verticalOffset - 2.5
    const finalLeft = adjustedLeft

    // Update Caret Position
    caretEl.style.transform = `translate(${finalLeft}px, ${finalTop}px)`
    caretEl.style.height = `${caretHeight + 1.25}px`
    caretEl.style.opacity = '1'

    // Motion Trail Logic
    if (lastCaretPos.current && trailContainerRef.current) {
      const prev = lastCaretPos.current
      // Only trail if moved significantly horizontally and on roughly the same line
      if (Math.abs(prev.top - finalTop) < 5 && Math.abs(prev.left - finalLeft) > 2) {
         createTrail(
             Math.min(prev.left, finalLeft),
             finalTop,
             Math.abs(prev.left - finalLeft) + 2,
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
        "w-full h-full rounded-md animate-trail-fade",
        isDelete ? "bg-red-500/30 shadow-[0_0_8px_rgba(239,68,68,0.4)]" : "bg-blue-400/20 shadow-[0_0_5px_rgba(96,165,250,0.3)]"
    )
    trail.appendChild(inner)

    trailContainerRef.current.appendChild(trail)

    // Cleanup after animation
    setTimeout(() => {
        if (trailContainerRef.current && trail.parentNode === trailContainerRef.current) {
            trailContainerRef.current.removeChild(trail)
        }
    }, 400) // Slightly longer than animation duration (300ms) to be safe
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
      caretElRef.current.style.opacity = '0'
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
      // console.log('CustomCaret: Native Focus')
      isFocusedRef.current = true
      updateCaret()
    }

    const handleBlur = () => {
      // console.log('CustomCaret: Native Blur')
      isFocusedRef.current = false
      if (caretElRef.current) {
        caretElRef.current.style.opacity = '0'
      }
    }

    const handleInput = () => {
        updateCaret()
    }

    const handleScroll = () => {
        updateCaret()
    }

    const handleClick = () => {
        updateCaret()
    }

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Backspace') {
            isBackspaceRef.current = true
        }
        // Defer update slightly to let input event happen or selection change
        // But input event usually handles the visual update
    }

    textarea.addEventListener('focus', handleFocus)
    textarea.addEventListener('blur', handleBlur)
    textarea.addEventListener('input', handleInput)
    textarea.addEventListener('scroll', handleScroll)
    textarea.addEventListener('click', handleClick)
    textarea.addEventListener('keydown', handleKeyDown)

    return () => {
      textarea.removeEventListener('focus', handleFocus)
      textarea.removeEventListener('blur', handleBlur)
      textarea.removeEventListener('input', handleInput)
      textarea.removeEventListener('scroll', handleScroll)
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

    document.addEventListener('selectionchange', handleSelectionChange)
    window.addEventListener('resize', updateCaret)

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
      window.removeEventListener('resize', updateCaret)
    }
  }, [updateCaret, hideCaret, textareaRef])

  return (
    <>
        {/* Trail Container */}
        <div ref={trailContainerRef} className="pointer-events-none absolute inset-0 overflow-hidden" />
        
        {/* Caret Element */}
        <div
            ref={caretElRef}
            className="pointer-events-none absolute w-[3px] bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.6)] z-10 animate-caret-breathe"
            style={{
                top: 0,
                left: 0,
                opacity: 0, // Hidden by default
                transition: 'transform 0.1s cubic-bezier(0.2, 0, 0, 1), height 0.1s ease',
            }}
        >
            <div className="absolute top-0 bottom-0 -left-[1px] w-[6px] bg-blue-400/20 blur-[2px] rounded-full" />
        </div>
    </>
  )
})

CustomCaretOverlay.displayName = 'CustomCaretOverlay'
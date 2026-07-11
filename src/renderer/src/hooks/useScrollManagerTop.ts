import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { Virtualizer } from '@tanstack/react-virtual'

export type UserScrollSource = 'wheel' | 'pointer'
type ChatVirtualizer = Virtualizer<HTMLDivElement, HTMLDivElement>

interface UseScrollManagerTopProps {
  messagesLength: number
  chatUuid?: string
  virtualizerRef: RefObject<ChatVirtualizer | null>
  onUserScrollIntentRef?: RefObject<((source: UserScrollSource) => void) | null>
  onUserScrollUpIntentRef?: RefObject<((source: UserScrollSource) => void) | null>
  suppressScrollIntentRef?: RefObject<boolean>
}

interface UseScrollManagerTopReturn {
  scrollParentRef: RefObject<HTMLDivElement | null>
  showJumpToLatest: boolean
  isButtonFadingOut: boolean
  showJumpToLatestButton: () => void
  hideJumpToLatestButton: (fade?: boolean) => void
  scrollToMessageIndex: (
    index: number,
    smooth?: boolean,
    align?: 'start' | 'center' | 'end'
  ) => void
}

export function useScrollManagerTop({
  messagesLength,
  chatUuid,
  virtualizerRef,
  onUserScrollIntentRef,
  onUserScrollUpIntentRef,
  suppressScrollIntentRef
}: UseScrollManagerTopProps): UseScrollManagerTopReturn {
  const scrollParentRef = useRef<HTMLDivElement>(null)
  const programmaticScrollRef = useRef<boolean>(false)
  const showJumpToLatestRef = useRef<boolean>(false)
  const lastChatUuidRef = useRef<string | undefined>(chatUuid)
  const smoothScrollTimeoutRef = useRef<number>(0)
  const buttonFadeTimeoutRef = useRef<number>(0)
  const prevScrollTopRef = useRef<number>(0)
  const pointerDownInContainerRef = useRef<boolean>(false)

  const [showJumpToLatest, setShowJumpToLatest] = useState<boolean>(false)
  const [isButtonFadingOut, setIsButtonFadingOut] = useState<boolean>(false)

  const showJumpToLatestButton = useCallback(() => {
    if (buttonFadeTimeoutRef.current) {
      clearTimeout(buttonFadeTimeoutRef.current)
      buttonFadeTimeoutRef.current = 0
    }
    showJumpToLatestRef.current = true
    setIsButtonFadingOut(false)
    setShowJumpToLatest(true)
  }, [])

  const hideJumpToLatestButton = useCallback((fade = false) => {
    if (buttonFadeTimeoutRef.current) {
      clearTimeout(buttonFadeTimeoutRef.current)
      buttonFadeTimeoutRef.current = 0
    }

    if (fade && showJumpToLatestRef.current) {
      setIsButtonFadingOut(true)
      buttonFadeTimeoutRef.current = window.setTimeout(() => {
        showJumpToLatestRef.current = false
        setShowJumpToLatest(false)
        setIsButtonFadingOut(false)
        buttonFadeTimeoutRef.current = 0
      }, 120)
      return
    }

    showJumpToLatestRef.current = false
    setShowJumpToLatest(false)
    setIsButtonFadingOut(false)
  }, [])

  const markProgrammaticScroll = useCallback(() => {
    programmaticScrollRef.current = true
    requestAnimationFrame(() => {
      programmaticScrollRef.current = false
    })
  }, [])

  const scrollToIndex = useCallback((
    index: number,
    smooth = false,
    align: 'start' | 'center' | 'end' = 'start'
  ) => {
    const virtualizer = virtualizerRef.current
    if (!virtualizer || index < 0) return
    if (smoothScrollTimeoutRef.current) {
      clearTimeout(smoothScrollTimeoutRef.current)
      smoothScrollTimeoutRef.current = 0
    }

    if (smooth) {
      smoothScrollTimeoutRef.current = window.setTimeout(() => {
        markProgrammaticScroll()
        virtualizerRef.current?.scrollToIndex(index, {
          align,
          behavior: 'smooth'
        })
        smoothScrollTimeoutRef.current = 0
      }, 120)
      return
    }

    markProgrammaticScroll()
    virtualizer.scrollToIndex(index, {
      align,
      behavior: 'auto'
    })
  }, [markProgrammaticScroll, virtualizerRef])

  useLayoutEffect(() => {
    showJumpToLatestRef.current = showJumpToLatest
  }, [showJumpToLatest])

  useLayoutEffect(() => {
    if (lastChatUuidRef.current === chatUuid) {
      return
    }

    lastChatUuidRef.current = chatUuid
    hideJumpToLatestButton()
  }, [chatUuid, hideJumpToLatestButton])

  useEffect(() => {
    if (messagesLength > 0) {
      return
    }
    hideJumpToLatestButton()
  }, [hideJumpToLatestButton, messagesLength])

  useEffect(() => {
    return () => {
      if (smoothScrollTimeoutRef.current) {
        clearTimeout(smoothScrollTimeoutRef.current)
        smoothScrollTimeoutRef.current = 0
      }
      if (buttonFadeTimeoutRef.current) {
        clearTimeout(buttonFadeTimeoutRef.current)
        buttonFadeTimeoutRef.current = 0
      }
    }
  }, [])

  useEffect(() => {
    const container = scrollParentRef.current
    if (!container) return

    prevScrollTopRef.current = container.scrollTop

    const notifyUserScrollIntent = (source: UserScrollSource) => {
      onUserScrollIntentRef?.current?.(source)
    }

    const showByUserUpScroll = (source: UserScrollSource) => {
      if (messagesLength <= 0) return
      showJumpToLatestButton()
      onUserScrollUpIntentRef?.current?.(source)
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!container.contains(event.target as Node)) return
      pointerDownInContainerRef.current = true
    }

    const onPointerUp = () => {
      pointerDownInContainerRef.current = false
    }

    const onWheel = (event: WheelEvent) => {
      // Wheel is an explicit user source and takes precedence over suppression,
      // which only guards scroll events emitted by programmatic adjustments.
      if (event.deltaY !== 0) {
        notifyUserScrollIntent('wheel')
      }
      if (event.deltaY < 0) {
        showByUserUpScroll('wheel')
      }
    }

    const onScroll = () => {
      const currentTop = container.scrollTop
      const activeUserSource = pointerDownInContainerRef.current ? 'pointer' : null

      if (activeUserSource && currentTop !== prevScrollTopRef.current) {
        notifyUserScrollIntent(activeUserSource)
      }
      if (activeUserSource && currentTop < prevScrollTopRef.current) {
        showByUserUpScroll(activeUserSource)
      }
      // An active pointer means the scrollbar or touch surface is user-driven.
      if (activeUserSource) {
        prevScrollTopRef.current = currentTop
        return
      }
      if (programmaticScrollRef.current || suppressScrollIntentRef?.current) {
        prevScrollTopRef.current = currentTop
        return
      }
      prevScrollTopRef.current = currentTop
    }

    container.addEventListener('pointerdown', onPointerDown, { passive: true })
    window.addEventListener('pointerup', onPointerUp, { passive: true })
    window.addEventListener('pointercancel', onPointerUp, { passive: true })
    container.addEventListener('wheel', onWheel, { passive: true })
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      container.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      container.removeEventListener('wheel', onWheel)
      container.removeEventListener('scroll', onScroll)
    }
  }, [
    messagesLength,
    onUserScrollIntentRef,
    onUserScrollUpIntentRef,
    showJumpToLatestButton,
    suppressScrollIntentRef
  ])

  return {
    scrollParentRef,
    showJumpToLatest,
    isButtonFadingOut,
    showJumpToLatestButton,
    hideJumpToLatestButton,
    scrollToMessageIndex: scrollToIndex
  }
}

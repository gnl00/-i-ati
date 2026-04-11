import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { VirtuosoHandle } from 'react-virtuoso'

export type UserScrollSource = 'wheel' | 'pointer'

interface UseScrollManagerTopProps {
  messagesLength: number
  chatUuid?: string
  onUserScrollIntentRef?: RefObject<((source: UserScrollSource) => void) | null>
  onUserScrollUpIntentRef?: RefObject<((source: UserScrollSource) => void) | null>
  suppressScrollIntentRef?: RefObject<boolean>
  onLatestVisibleChange?: (visible: boolean) => void
}

interface UseScrollManagerTopReturn {
  scrollParentRef: RefObject<HTMLDivElement | null>
  virtuosoRef: RefObject<VirtuosoHandle | null>
  showJumpToLatest: boolean
  isButtonFadingOut: boolean
  scrollToLatest: (smooth?: boolean) => void
  scrollToMessageIndex: (
    index: number,
    smooth?: boolean,
    align?: 'start' | 'center' | 'end'
  ) => void
  onRangeChanged: (range: { startIndex: number; endIndex: number }) => void
}

export function useScrollManagerTop({
  messagesLength,
  chatUuid,
  onUserScrollIntentRef,
  onUserScrollUpIntentRef,
  suppressScrollIntentRef,
  onLatestVisibleChange
}: UseScrollManagerTopProps): UseScrollManagerTopReturn {
  const scrollParentRef = useRef<HTMLDivElement>(null)
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const programmaticScrollRef = useRef<boolean>(false)
  const showJumpToLatestRef = useRef<boolean>(false)
  const lastChatUuidRef = useRef<string | undefined>(chatUuid)
  const smoothScrollTimeoutRef = useRef<number>(0)
  const prevScrollTopRef = useRef<number>(0)
  const pointerDownInContainerRef = useRef<boolean>(false)

  const [showJumpToLatest, setShowJumpToLatest] = useState<boolean>(false)
  const [isButtonFadingOut, setIsButtonFadingOut] = useState<boolean>(false)

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
    if (!virtuosoRef.current || index < 0) return
    if (smoothScrollTimeoutRef.current) {
      clearTimeout(smoothScrollTimeoutRef.current)
      smoothScrollTimeoutRef.current = 0
    }

    if (smooth) {
      setIsButtonFadingOut(true)
      smoothScrollTimeoutRef.current = window.setTimeout(() => {
        markProgrammaticScroll()
        virtuosoRef.current?.scrollToIndex({ index, align, behavior: 'smooth' })
        setIsButtonFadingOut(false)
        smoothScrollTimeoutRef.current = 0
      }, 120)
      return
    }

    markProgrammaticScroll()
    virtuosoRef.current.scrollToIndex({ index, align, behavior: 'auto' })
  }, [markProgrammaticScroll])

  const scrollToLatest = useCallback((smooth = false) => {
    if (messagesLength <= 0) return
    scrollToIndex(messagesLength - 1, smooth)
  }, [messagesLength, scrollToIndex])

  const onRangeChanged = useCallback((range: { startIndex: number; endIndex: number }) => {
    if (messagesLength <= 0) {
      onLatestVisibleChange?.(false)
      if (showJumpToLatestRef.current) {
        setShowJumpToLatest(false)
      }
      return
    }

    const latestIndex = messagesLength - 1
    const latestVisible = range.startIndex <= latestIndex && range.endIndex >= latestIndex
    onLatestVisibleChange?.(latestVisible)

    if (latestVisible) {
      if (showJumpToLatestRef.current) {
        setShowJumpToLatest(false)
      }
      setIsButtonFadingOut(false)
      return
    }

    if (!programmaticScrollRef.current && !showJumpToLatestRef.current) {
      setShowJumpToLatest(true)
    }
  }, [messagesLength, onLatestVisibleChange])

  useEffect(() => {
    showJumpToLatestRef.current = showJumpToLatest
  }, [showJumpToLatest])

  useEffect(() => {
    if (lastChatUuidRef.current === chatUuid) {
      return
    }

    lastChatUuidRef.current = chatUuid
    showJumpToLatestRef.current = false
    setShowJumpToLatest(false)
    setIsButtonFadingOut(false)
  }, [chatUuid])

  useEffect(() => {
    if (messagesLength > 0) {
      return
    }
    showJumpToLatestRef.current = false
    setShowJumpToLatest(false)
    setIsButtonFadingOut(false)
  }, [messagesLength])

  useEffect(() => {
    return () => {
      if (smoothScrollTimeoutRef.current) {
        clearTimeout(smoothScrollTimeoutRef.current)
        smoothScrollTimeoutRef.current = 0
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
      if (!showJumpToLatestRef.current) {
        setShowJumpToLatest(true)
      }
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
      if (suppressScrollIntentRef?.current) {
        prevScrollTopRef.current = container.scrollTop
        return
      }
      if (event.deltaY !== 0) {
        notifyUserScrollIntent('wheel')
      }
      if (event.deltaY < 0) {
        showByUserUpScroll('wheel')
      }
    }

    const onScroll = () => {
      if (programmaticScrollRef.current || suppressScrollIntentRef?.current) {
        prevScrollTopRef.current = container.scrollTop
        return
      }

      const currentTop = container.scrollTop
      const activeUserSource = pointerDownInContainerRef.current ? 'pointer' : null

      if (activeUserSource && currentTop !== prevScrollTopRef.current) {
        notifyUserScrollIntent(activeUserSource)
      }
      if (activeUserSource && currentTop < prevScrollTopRef.current) {
        showByUserUpScroll(activeUserSource)
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
  }, [messagesLength, onUserScrollIntentRef, onUserScrollUpIntentRef, suppressScrollIntentRef])

  return {
    scrollParentRef,
    virtuosoRef,
    showJumpToLatest,
    isButtonFadingOut,
    scrollToLatest,
    scrollToMessageIndex: scrollToIndex,
    onRangeChanged
  }
}

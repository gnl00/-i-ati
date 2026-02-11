import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { VirtuosoHandle } from 'react-virtuoso'

interface UseScrollManagerLiteProps {
  messagesLength: number
  chatUuid?: string
}

interface UseScrollManagerLiteReturn {
  scrollParentRef: RefObject<HTMLDivElement | null>
  virtuosoRef: RefObject<VirtuosoHandle | null>
  showScrollToBottom: boolean
  isButtonFadingOut: boolean
  scrollToBottom: (smooth?: boolean) => void
  onTyping: () => void
  onMessagesUpdate: () => void
  onAtBottomStateChange: (atBottom: boolean) => void
}

type AutoScrollReason = 'typing' | 'messages'

export function useScrollManagerLite({
  messagesLength,
  chatUuid
}: UseScrollManagerLiteProps): UseScrollManagerLiteReturn {
  const scrollParentRef = useRef<HTMLDivElement>(null)
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const isAtBottomRef = useRef<boolean>(true)
  const autoScrollRafRef = useRef<number>(0)
  const userScrollOverrideRef = useRef<boolean>(false)
  const programmaticScrollRef = useRef<boolean>(false)
  const forceScrollRafRef = useRef<number>(0)
  const showScrollToBottomRef = useRef<boolean>(false)
  const smoothScrollTimeoutRef = useRef<number>(0)

  const [showScrollToBottom, setShowScrollToBottom] = useState<boolean>(false)
  const [isButtonFadingOut, setIsButtonFadingOut] = useState<boolean>(false)

  const lockAutoScrollByUserIntent = useCallback(() => {
    if (programmaticScrollRef.current) return
    if (autoScrollRafRef.current) {
      cancelAnimationFrame(autoScrollRafRef.current)
      autoScrollRafRef.current = 0
    }
    userScrollOverrideRef.current = true
    if (!showScrollToBottomRef.current) {
      setShowScrollToBottom(true)
    }
  }, [])

  const unlockAutoScroll = useCallback(() => {
    userScrollOverrideRef.current = false
    if (showScrollToBottomRef.current) {
      setShowScrollToBottom(false)
    }
  }, [])

  const markProgrammaticScroll = useCallback(() => {
    programmaticScrollRef.current = true
    requestAnimationFrame(() => {
      programmaticScrollRef.current = false
    })
  }, [])

  const scrollToBottom = useCallback((smooth = false) => {
    if (!virtuosoRef.current) return
    if (smoothScrollTimeoutRef.current) {
      clearTimeout(smoothScrollTimeoutRef.current)
      smoothScrollTimeoutRef.current = 0
    }
    unlockAutoScroll()
    if (smooth) {
      setIsButtonFadingOut(true)
      smoothScrollTimeoutRef.current = window.setTimeout(() => {
        markProgrammaticScroll()
        virtuosoRef.current?.scrollToIndex({ index: messagesLength - 1, align: 'end', behavior: 'smooth' })
        setIsButtonFadingOut(false)
        smoothScrollTimeoutRef.current = 0
      }, 120)
      return
    }
    markProgrammaticScroll()
    virtuosoRef.current.scrollToIndex({ index: messagesLength - 1, align: 'end', behavior: 'auto' })
  }, [markProgrammaticScroll, messagesLength, unlockAutoScroll])

  const requestAutoScroll = useCallback((reason: AutoScrollReason) => {
    if (!virtuosoRef.current) return
    if (userScrollOverrideRef.current) return
    if (reason !== 'messages' && !isAtBottomRef.current) return
    if (autoScrollRafRef.current) return
    autoScrollRafRef.current = requestAnimationFrame(() => {
      autoScrollRafRef.current = 0
      if (userScrollOverrideRef.current) return
      if (reason !== 'messages' && !isAtBottomRef.current) return
      scrollToBottom(false)
    })
  }, [scrollToBottom])

  const onMessagesUpdate = useCallback(() => {
    requestAutoScroll('messages')
  }, [requestAutoScroll])

  const onTyping = useCallback(() => {
    requestAutoScroll('typing')
  }, [requestAutoScroll])

  useEffect(() => {
    showScrollToBottomRef.current = showScrollToBottom
  }, [showScrollToBottom])

  useEffect(() => {
    if (!chatUuid || messagesLength <= 0) return
    if (smoothScrollTimeoutRef.current) {
      clearTimeout(smoothScrollTimeoutRef.current)
      smoothScrollTimeoutRef.current = 0
      setIsButtonFadingOut(false)
    }
    unlockAutoScroll()
    isAtBottomRef.current = true
    const index = messagesLength - 1
    if (!virtuosoRef.current) return
    if (forceScrollRafRef.current) {
      cancelAnimationFrame(forceScrollRafRef.current)
    }
    forceScrollRafRef.current = requestAnimationFrame(() => {
      markProgrammaticScroll()
      virtuosoRef.current?.scrollToIndex({ index, align: 'end', behavior: 'auto' })
      forceScrollRafRef.current = 0
    })
  }, [chatUuid, markProgrammaticScroll, messagesLength, unlockAutoScroll])

  useEffect(() => {
    const container = scrollParentRef.current
    if (!container) return

    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) {
        lockAutoScrollByUserIntent()
      }
    }

    container.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      container.removeEventListener('wheel', onWheel)
    }
  }, [lockAutoScrollByUserIntent])

  useEffect(() => {
    return () => {
      if (forceScrollRafRef.current) {
        cancelAnimationFrame(forceScrollRafRef.current)
      }
      if (autoScrollRafRef.current) {
        cancelAnimationFrame(autoScrollRafRef.current)
        autoScrollRafRef.current = 0
      }
      if (smoothScrollTimeoutRef.current) {
        clearTimeout(smoothScrollTimeoutRef.current)
        smoothScrollTimeoutRef.current = 0
      }
    }
  }, [])

  const onAtBottomStateChange = useCallback((atBottom: boolean) => {
    isAtBottomRef.current = atBottom
    if (programmaticScrollRef.current) {
      return
    }
    if (atBottom) {
      unlockAutoScroll()
      setIsButtonFadingOut(false)
      return
    }
    if (!showScrollToBottomRef.current) {
      setShowScrollToBottom(true)
    }
  }, [unlockAutoScroll])

  return {
    scrollParentRef,
    virtuosoRef,
    showScrollToBottom,
    isButtonFadingOut,
    scrollToBottom,
    onTyping,
    onMessagesUpdate,
    onAtBottomStateChange
  }
}

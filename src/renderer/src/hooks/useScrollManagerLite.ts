import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { VirtuosoHandle } from 'react-virtuoso'

type FollowOutputValue = false | 'auto'

interface UseScrollManagerLiteProps {
  messagesLength: number
  chatUuid?: string
  isStreaming: boolean
}

interface UseScrollManagerLiteReturn {
  scrollParentRef: RefObject<HTMLDivElement | null>
  virtuosoRef: RefObject<VirtuosoHandle | null>
  showScrollToBottom: boolean
  isButtonFadingOut: boolean
  scrollToBottom: (smooth?: boolean) => void
  onTyping: () => void
  onMessagesUpdate: () => void
  followOutput: () => FollowOutputValue
  onAtBottomStateChange: (atBottom: boolean) => void
}

type AutoScrollReason = 'typing' | 'messages' | 'messagesLength'

export function useScrollManagerLite({
  messagesLength,
  chatUuid,
  isStreaming
}: UseScrollManagerLiteProps): UseScrollManagerLiteReturn {
  const scrollParentRef = useRef<HTMLDivElement>(null)
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const isAtBottomRef = useRef<boolean>(true)
  const autoScrollRafRef = useRef<number>(0)
  const userScrollOverrideRef = useRef<boolean>(false)
  const forceScrollRafRef = useRef<number>(0)
  const showScrollToBottomRef = useRef<boolean>(false)
  const smoothScrollTimeoutRef = useRef<number>(0)

  const [showScrollToBottom, setShowScrollToBottom] = useState<boolean>(false)
  const [isButtonFadingOut, setIsButtonFadingOut] = useState<boolean>(false)

  const lockAutoScrollByUserIntent = useCallback(() => {
    userScrollOverrideRef.current = true
    if (!showScrollToBottomRef.current) {
      setShowScrollToBottom(true)
    }
  }, [])

  const scrollToBottom = useCallback((smooth = false) => {
    if (!virtuosoRef.current) return
    if (smoothScrollTimeoutRef.current) {
      clearTimeout(smoothScrollTimeoutRef.current)
      smoothScrollTimeoutRef.current = 0
    }
    setShowScrollToBottom(false)
    userScrollOverrideRef.current = false
    if (smooth) {
      setIsButtonFadingOut(true)
      smoothScrollTimeoutRef.current = window.setTimeout(() => {
        virtuosoRef.current?.scrollToIndex({ index: messagesLength - 1, align: 'end', behavior: 'smooth' })
        setIsButtonFadingOut(false)
        smoothScrollTimeoutRef.current = 0
      }, 120)
      return
    }
    virtuosoRef.current.scrollToIndex({ index: messagesLength - 1, align: 'end', behavior: 'auto' })
  }, [messagesLength])

  const requestAutoScroll = useCallback((reason: AutoScrollReason) => {
    if (!virtuosoRef.current) return
    if (userScrollOverrideRef.current) return
    if (reason !== 'messages' && !isAtBottomRef.current) return
    if (autoScrollRafRef.current) return
    autoScrollRafRef.current = requestAnimationFrame(() => {
      autoScrollRafRef.current = 0
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
    if (isAtBottomRef.current) {
      requestAutoScroll('messagesLength')
    }
  }, [messagesLength, requestAutoScroll])

  useEffect(() => {
    if (!chatUuid || messagesLength <= 0) return
    if (smoothScrollTimeoutRef.current) {
      clearTimeout(smoothScrollTimeoutRef.current)
      smoothScrollTimeoutRef.current = 0
      setIsButtonFadingOut(false)
    }
    userScrollOverrideRef.current = false
    isAtBottomRef.current = true
    setShowScrollToBottom(false)
    const index = messagesLength - 1
    if (!virtuosoRef.current) return
    if (forceScrollRafRef.current) {
      cancelAnimationFrame(forceScrollRafRef.current)
    }
    forceScrollRafRef.current = requestAnimationFrame(() => {
      virtuosoRef.current?.scrollToIndex({ index, align: 'end', behavior: 'auto' })
      forceScrollRafRef.current = 0
    })
  }, [chatUuid, messagesLength])

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

  const followOutput = useCallback((): FollowOutputValue => {
    if (!isStreaming) return false
    if (userScrollOverrideRef.current) return false
    if (isAtBottomRef.current) return 'auto'
    return false
  }, [isStreaming])

  const onAtBottomStateChange = useCallback((atBottom: boolean) => {
    isAtBottomRef.current = atBottom
    if (atBottom) {
      userScrollOverrideRef.current = false
      setIsButtonFadingOut(false)
      if (showScrollToBottomRef.current) {
        setShowScrollToBottom(false)
      }
      return
    }

    lockAutoScrollByUserIntent()
  }, [lockAutoScrollByUserIntent])

  return {
    scrollParentRef,
    virtuosoRef,
    showScrollToBottom,
    isButtonFadingOut,
    scrollToBottom,
    onTyping,
    onMessagesUpdate,
    followOutput,
    onAtBottomStateChange
  }
}

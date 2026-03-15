import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { VirtuosoHandle } from 'react-virtuoso'
import { resolveAnchorIndex } from '@renderer/components/chat/scroll-anchor'

interface UseScrollManagerTopProps {
  messages: MessageEntity[]
  messagesLength: number
  chatUuid?: string
  onUserScrollUpIntentRef?: RefObject<(() => void) | null>
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
  messages,
  messagesLength,
  chatUuid,
  onUserScrollUpIntentRef
}: UseScrollManagerTopProps): UseScrollManagerTopReturn {
  const scrollParentRef = useRef<HTMLDivElement>(null)
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const programmaticScrollRef = useRef<boolean>(false)
  const showJumpToLatestRef = useRef<boolean>(false)
  const prevMessagesLengthRef = useRef<number>(messagesLength)
  const lastChatUuidRef = useRef<string | undefined>(chatUuid)
  const pendingChatInitScrollRef = useRef<boolean>(false)
  const forceScrollRafRef = useRef<number>(0)
  const settleScrollRafRef = useRef<number>(0)
  const smoothScrollTimeoutRef = useRef<number>(0)
  const prevScrollTopRef = useRef<number>(0)

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
      if (showJumpToLatestRef.current) {
        setShowJumpToLatest(false)
      }
      return
    }

    const latestIndex = messagesLength - 1
    const latestVisible = range.startIndex <= latestIndex && range.endIndex >= latestIndex

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
  }, [messagesLength])

  useEffect(() => {
    showJumpToLatestRef.current = showJumpToLatest
  }, [showJumpToLatest])

  useEffect(() => {
    const previousLength = prevMessagesLengthRef.current
    const hasNewMessage = messagesLength > previousLength
    prevMessagesLengthRef.current = messagesLength

    if (!hasNewMessage || messagesLength <= 0) {
      return
    }

    if (forceScrollRafRef.current) {
      cancelAnimationFrame(forceScrollRafRef.current)
    }
    if (settleScrollRafRef.current) {
      cancelAnimationFrame(settleScrollRafRef.current)
      settleScrollRafRef.current = 0
    }

    forceScrollRafRef.current = requestAnimationFrame(() => {
      if (pendingChatInitScrollRef.current) {
        pendingChatInitScrollRef.current = false
      }
      const targetIndex = resolveAnchorIndex(messages, 'latestUserForAutoTop')
      scrollToIndex(targetIndex, false)
      settleScrollRafRef.current = requestAnimationFrame(() => {
        scrollToIndex(targetIndex, false)
        settleScrollRafRef.current = 0
      })
      forceScrollRafRef.current = 0
    })
  }, [messages, messagesLength, scrollToIndex])

  useEffect(() => {
    if (lastChatUuidRef.current === chatUuid) {
      return
    }

    lastChatUuidRef.current = chatUuid
    pendingChatInitScrollRef.current = true
  }, [chatUuid])

  useEffect(() => {
    return () => {
      if (forceScrollRafRef.current) {
        cancelAnimationFrame(forceScrollRafRef.current)
      }
      if (settleScrollRafRef.current) {
        cancelAnimationFrame(settleScrollRafRef.current)
        settleScrollRafRef.current = 0
      }
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

    const showByUserUpScroll = () => {
      if (messagesLength <= 0) return
      if (!showJumpToLatestRef.current) {
        setShowJumpToLatest(true)
      }
      onUserScrollUpIntentRef?.current?.()
    }

    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) {
        showByUserUpScroll()
      }
    }

    const onScroll = () => {
      const currentTop = container.scrollTop
      if (currentTop < prevScrollTopRef.current) {
        showByUserUpScroll()
      }
      prevScrollTopRef.current = currentTop
    }

    container.addEventListener('wheel', onWheel, { passive: true })
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      container.removeEventListener('wheel', onWheel)
      container.removeEventListener('scroll', onScroll)
    }
  }, [messagesLength, onUserScrollUpIntentRef])

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

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { VirtuosoHandle } from 'react-virtuoso'

type FollowOutputValue = false | 'auto'

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
  followOutput: () => FollowOutputValue
  onAtBottomStateChange: (atBottom: boolean) => void
}

export function useScrollManagerLite({
  messagesLength,
  chatUuid
}: UseScrollManagerLiteProps): UseScrollManagerLiteReturn {
  const scrollParentRef = useRef<HTMLDivElement>(null)
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const isAtBottomRef = useRef<boolean>(true)
  const typingScrollRafRef = useRef<number>(0)
  const userScrollOverrideRef = useRef<boolean>(false)
  const lastScrollTopRef = useRef<number>(0)
  const forceScrollRafRef = useRef<number>(0)
  const scrollRafRef = useRef<number>(0)
  const lastUserScrollTsRef = useRef<number>(0)
  const showScrollToBottomRef = useRef<boolean>(false)
  const suppressNextFollowOutputRef = useRef<boolean>(false)

  const [showScrollToBottom, setShowScrollToBottom] = useState<boolean>(false)
  const [isButtonFadingOut, setIsButtonFadingOut] = useState<boolean>(false)

  const scrollToBottom = useCallback((smooth = false) => {
    if (!virtuosoRef.current) return
    setShowScrollToBottom(false)
    userScrollOverrideRef.current = false
    if (smooth) {
      setIsButtonFadingOut(true)
      setTimeout(() => {
        virtuosoRef.current?.scrollToIndex({ index: messagesLength - 1, align: 'end', behavior: 'smooth' })
        setIsButtonFadingOut(false)
      }, 120)
      return
    }
    virtuosoRef.current.scrollToIndex({ index: messagesLength - 1, align: 'end', behavior: 'auto' })
  }, [messagesLength])

  const onMessagesUpdate = useCallback(() => {
    suppressNextFollowOutputRef.current = true
    scrollToBottom(false)
  }, [scrollToBottom])

  const onTyping = useCallback(() => {
    if (!isAtBottomRef.current) return
    if (typingScrollRafRef.current) return
    typingScrollRafRef.current = requestAnimationFrame(() => {
      typingScrollRafRef.current = 0
      scrollToBottom(false)
    })
  }, [scrollToBottom])

  useEffect(() => {
    showScrollToBottomRef.current = showScrollToBottom
  }, [showScrollToBottom])

  useEffect(() => {
    const container = scrollParentRef.current
    if (!container) return
    if (isAtBottomRef.current) {
      scrollToBottom(false)
      suppressNextFollowOutputRef.current = false
      return
    }
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight
    if (distanceFromBottom > 40 && !showScrollToBottomRef.current) {
      setShowScrollToBottom(true)
    }
    suppressNextFollowOutputRef.current = false
  }, [messagesLength, scrollToBottom])

  useEffect(() => {
    userScrollOverrideRef.current = false
    isAtBottomRef.current = true
    setShowScrollToBottom(false)
    const index = messagesLength - 1
    if (index < 0) return
    if (!virtuosoRef.current) return
    if (forceScrollRafRef.current) {
      cancelAnimationFrame(forceScrollRafRef.current)
    }
    forceScrollRafRef.current = requestAnimationFrame(() => {
      virtuosoRef.current?.scrollToIndex({ index, align: 'end', behavior: 'smooth' })
      forceScrollRafRef.current = 0
    })
  }, [chatUuid])

  useEffect(() => {
    return () => {
      if (forceScrollRafRef.current) {
        cancelAnimationFrame(forceScrollRafRef.current)
      }
      if (typingScrollRafRef.current) {
        cancelAnimationFrame(typingScrollRafRef.current)
      }
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current)
        scrollRafRef.current = 0
      }
    }
  }, [])

  useEffect(() => {
    const container = scrollParentRef.current
    if (!container) return
    lastScrollTopRef.current = container.scrollTop
    const onUserIntent = () => {
      lastUserScrollTsRef.current = Date.now()
    }
    const onScroll = () => {
      if (scrollRafRef.current) return
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = 0
        const currentTop = container.scrollTop
        const delta = currentTop - lastScrollTopRef.current
        lastScrollTopRef.current = currentTop
        const timeSinceUserIntent = Date.now() - lastUserScrollTsRef.current
        if (timeSinceUserIntent < 200) {
          userScrollOverrideRef.current = true
        }
        const distanceFromBottom =
          container.scrollHeight - container.scrollTop - container.clientHeight
        if (delta < 0) {
          isAtBottomRef.current = false
          if (distanceFromBottom > 40 && !showScrollToBottomRef.current) {
            setShowScrollToBottom(true)
          }
        } else if (delta > 0) {
          if (distanceFromBottom < 12 && showScrollToBottomRef.current) {
            setShowScrollToBottom(false)
          }
        }
      })
    }
    container.addEventListener('wheel', onUserIntent, { passive: true })
    container.addEventListener('pointerdown', onUserIntent)
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current)
        scrollRafRef.current = 0
      }
      container.removeEventListener('wheel', onUserIntent)
      container.removeEventListener('pointerdown', onUserIntent)
      container.removeEventListener('scroll', onScroll)
    }
  }, [])

  const followOutput = useCallback((): FollowOutputValue => {
    if (suppressNextFollowOutputRef.current) return false
    if (userScrollOverrideRef.current) return false
    if (isAtBottomRef.current) return 'auto'
    return false
  }, [])

  const onAtBottomStateChange = useCallback((atBottom: boolean) => {
    isAtBottomRef.current = atBottom
    if (atBottom) {
      userScrollOverrideRef.current = false
      setIsButtonFadingOut(false)
      if (showScrollToBottomRef.current) {
        setShowScrollToBottom(false)
      }
    }
  }, [])

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

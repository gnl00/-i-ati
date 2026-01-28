import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { VirtuosoHandle } from 'react-virtuoso'

type FollowOutputValue = false | 'auto'

interface UseScrollManagerLiteProps {
  messagesLength: number
  chatUuid?: string
}

interface UseScrollManagerLiteReturn {
  scrollParentRef: RefObject<HTMLDivElement>
  virtuosoRef: RefObject<VirtuosoHandle>
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
    if (!isAtBottomRef.current) return
    scrollToBottom(false)
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
  }, [chatUuid, messagesLength])

  useEffect(() => {
    return () => {
      if (forceScrollRafRef.current) {
        cancelAnimationFrame(forceScrollRafRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const container = scrollParentRef.current
    if (!container) return
    lastScrollTopRef.current = container.scrollTop
    const onScroll = () => {
      const currentTop = container.scrollTop
      const delta = currentTop - lastScrollTopRef.current
      lastScrollTopRef.current = currentTop
      userScrollOverrideRef.current = true
      if (delta < 0) {
        isAtBottomRef.current = false
        setShowScrollToBottom(true)
      }
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', onScroll)
    }
  }, [])

  const followOutput = useCallback((): FollowOutputValue => {
    if (userScrollOverrideRef.current) return false
    if (isAtBottomRef.current) return 'auto'
    return false
  }, [])

  const onAtBottomStateChange = useCallback((atBottom: boolean) => {
    isAtBottomRef.current = atBottom
    setShowScrollToBottom(!atBottom)
    if (atBottom) {
      userScrollOverrideRef.current = false
      setIsButtonFadingOut(false)
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

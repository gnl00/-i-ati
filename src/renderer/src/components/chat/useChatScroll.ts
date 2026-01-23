import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

interface UseChatScrollParams {
  chatUuid?: string
  messageCount: number
  scrollContainerRef: RefObject<HTMLDivElement | null>
  chatListRef: RefObject<HTMLDivElement | null>
  chatPaddingElRef: RefObject<HTMLDivElement | null>
}

interface UseChatScrollResult {
  showScrollToBottom: boolean
  isButtonFadingOut: boolean
  scrollToBottom: (smooth?: boolean) => void
  onMessagesUpdate: () => void
  onTyping: () => void
}

export function useChatScroll({
  chatUuid,
  messageCount,
  scrollContainerRef,
  chatListRef,
  chatPaddingElRef
}: UseChatScrollParams): UseChatScrollResult {
  const lastChatUuidRef = useRef<string | undefined>(undefined)
  const smoothScrollRAFRef = useRef<number>(0)
  const autoScrollRAFRef = useRef<number>(0)
  const resizeRAFRef = useRef<number>(0)
  const isStickToBottomRef = useRef<boolean>(true)
  const isSmoothScrollingRef = useRef<boolean>(false)
  const hasUserScrollIntentRef = useRef<boolean>(false)

  const [showScrollToBottom, setShowScrollToBottom] = useState<boolean>(false)
  const [isButtonFadingOut, setIsButtonFadingOut] = useState<boolean>(false)

  const resetScrollButton = useCallback(() => {
    setShowScrollToBottom(false)
    setIsButtonFadingOut(false)
  }, [])

  const setScrollButtonVisible = useCallback((visible: boolean) => {
    setShowScrollToBottom(prev => {
      if (prev === visible) return prev
      setIsButtonFadingOut(false)
      return visible
    })
  }, [])

  const easeOutCubic = useCallback((t: number): number => {
    return 1 - Math.pow(1 - t, 3)
  }, [])

  const smoothScrollToBottom = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return

    if (smoothScrollRAFRef.current) {
      cancelAnimationFrame(smoothScrollRAFRef.current)
      smoothScrollRAFRef.current = 0
    }
    isSmoothScrollingRef.current = false

    const startPos = container.scrollTop
    const getEndPos = () => container.scrollHeight - container.clientHeight
    const initialEndPos = getEndPos()
    const initialDistance = initialEndPos - startPos

    if (Math.abs(initialDistance) < 1) {
      resetScrollButton()
      isSmoothScrollingRef.current = false
      return
    }

    const duration = Math.min(Math.max(Math.abs(initialDistance) * 0.5, 300), 800)
    const startTime = performance.now()
    isSmoothScrollingRef.current = true

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = easeOutCubic(progress)

      const currentEndPos = getEndPos()
      const currentDistance = currentEndPos - startPos
      container.scrollTop = startPos + currentDistance * eased

      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
      const isAtBottom = distanceFromBottom < 1

      if (progress < 1 && !isAtBottom) {
        smoothScrollRAFRef.current = requestAnimationFrame(animate)
      } else {
        container.scrollTop = currentEndPos
        smoothScrollRAFRef.current = 0
        isSmoothScrollingRef.current = false
        resetScrollButton()
      }
    }

    smoothScrollRAFRef.current = requestAnimationFrame(animate)
  }, [easeOutCubic, resetScrollButton, scrollContainerRef])

  const autoScrollToBottom = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight - container.clientHeight
  }, [scrollContainerRef])

  const scheduleAutoScroll = useCallback(() => {
    if (!isStickToBottomRef.current || isSmoothScrollingRef.current) return
    if (autoScrollRAFRef.current) return
    autoScrollRAFRef.current = requestAnimationFrame(() => {
      autoScrollRAFRef.current = 0
      autoScrollToBottom()
    })
  }, [autoScrollToBottom])

  const cancelSmoothScroll = useCallback(() => {
    if (smoothScrollRAFRef.current) {
      cancelAnimationFrame(smoothScrollRAFRef.current)
      smoothScrollRAFRef.current = 0
    }
    isSmoothScrollingRef.current = false
  }, [])

  const scrollToBottom = useCallback((smooth = false) => {
    isStickToBottomRef.current = true
    if (!smooth) {
      resetScrollButton()
      autoScrollToBottom()
      return
    }

    if (showScrollToBottom) {
      setIsButtonFadingOut(true)
    }

    setTimeout(() => {
      smoothScrollToBottom()
    }, 120)
  }, [autoScrollToBottom, resetScrollButton, showScrollToBottom, smoothScrollToBottom])

  const scrollToBottomForced = useCallback(() => {
    setTimeout(() => {
      scrollToBottom(true)
    }, 100)
  }, [scrollToBottom])

  const onMessagesUpdate = useCallback(() => {
    hasUserScrollIntentRef.current = false
    isStickToBottomRef.current = true
    resetScrollButton()
    scrollToBottomForced()
  }, [resetScrollButton, scrollToBottomForced])

  const updateBottomState = useCallback((isAtBottom: boolean) => {
    if (isSmoothScrollingRef.current) {
      if (isAtBottom) {
        isStickToBottomRef.current = true
        resetScrollButton()
        hasUserScrollIntentRef.current = false
      }
      return
    }

    if (isAtBottom) {
      if (!isStickToBottomRef.current) {
        isStickToBottomRef.current = true
      }
      hasUserScrollIntentRef.current = false
      setScrollButtonVisible(false)
    } else {
      if (!hasUserScrollIntentRef.current && isStickToBottomRef.current) {
        return
      }
      if (isStickToBottomRef.current) {
        isStickToBottomRef.current = false
      }
      setScrollButtonVisible(true)
    }
  }, [resetScrollButton, setScrollButtonVisible])

  const onChatListScroll = useCallback((evt: Event) => {
    const target = evt.target as HTMLDivElement
    const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight
    updateBottomState(distanceFromBottom < 10)
  }, [updateBottomState])

  const onUserScrollIntent = useCallback(() => {
    hasUserScrollIntentRef.current = true
    if (!isSmoothScrollingRef.current) return
    cancelSmoothScroll()
    isStickToBottomRef.current = false
    setScrollButtonVisible(true)
  }, [cancelSmoothScroll, setScrollButtonVisible])

  useEffect(() => {
    const chatListElement = scrollContainerRef.current
    if (chatListElement) {
      chatListElement.addEventListener('wheel', onUserScrollIntent, { passive: true })
      chatListElement.addEventListener('touchstart', onUserScrollIntent, { passive: true })
      chatListElement.addEventListener('pointerdown', onUserScrollIntent)
      if (!('IntersectionObserver' in window)) {
        chatListElement.addEventListener('scroll', onChatListScroll)
      }
    }

    return () => {
      if (chatListElement) {
        chatListElement.removeEventListener('wheel', onUserScrollIntent)
        chatListElement.removeEventListener('touchstart', onUserScrollIntent)
        chatListElement.removeEventListener('pointerdown', onUserScrollIntent)
        chatListElement.removeEventListener('scroll', onChatListScroll)
      }
      if (autoScrollRAFRef.current) {
        cancelAnimationFrame(autoScrollRAFRef.current)
        autoScrollRAFRef.current = 0
      }
      if (smoothScrollRAFRef.current) {
        cancelSmoothScroll()
      }
    }
  }, [cancelSmoothScroll, onChatListScroll, onUserScrollIntent, scrollContainerRef])

  useEffect(() => {
    const chatListElement = scrollContainerRef.current
    const sentinelElement = chatPaddingElRef.current
    if (!chatListElement || !sentinelElement) return
    if (!('IntersectionObserver' in window)) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.length === 0) return
        updateBottomState(entries[0].isIntersecting)
      },
      {
        root: chatListElement,
        threshold: 0,
        rootMargin: '0px 0px 8px 0px',
      }
    )

    observer.observe(sentinelElement)

    return () => {
      observer.disconnect()
    }
  }, [chatPaddingElRef, scrollContainerRef, updateBottomState])

  useEffect(() => {
    if (showScrollToBottom && autoScrollRAFRef.current) {
      cancelAnimationFrame(autoScrollRAFRef.current)
      autoScrollRAFRef.current = 0
    }
  }, [showScrollToBottom])

  useEffect(() => {
    const prevChatUuid = lastChatUuidRef.current
    const currentChatUuid = chatUuid
    const isChatSwitch = prevChatUuid !== currentChatUuid
    lastChatUuidRef.current = currentChatUuid
    if (isChatSwitch) {
      isStickToBottomRef.current = true
      resetScrollButton()
      cancelSmoothScroll()
      if (chatPaddingElRef.current) {
        requestAnimationFrame(() => {
          setTimeout(() => {
            scrollToBottom(false)
          }, 100)
        })
      }
    }
  }, [chatUuid, cancelSmoothScroll, resetScrollButton, scrollToBottom, chatPaddingElRef])

  useEffect(() => {
    scheduleAutoScroll()
  }, [messageCount, scheduleAutoScroll])

  const onTyping = useCallback(() => {
    scheduleAutoScroll()
  }, [scheduleAutoScroll])

  useEffect(() => {
    if (showScrollToBottom) return
    const chatListElement = chatListRef.current
    if (!chatListElement) return

    const scheduleResizeScroll = () => {
      if (resizeRAFRef.current) return
      resizeRAFRef.current = requestAnimationFrame(() => {
        resizeRAFRef.current = 0
        scheduleAutoScroll()
      })
    }

    const resizeObserver = new ResizeObserver(scheduleResizeScroll)

    resizeObserver.observe(chatListElement)

    return () => {
      resizeObserver.disconnect()
      if (resizeRAFRef.current) {
        cancelAnimationFrame(resizeRAFRef.current)
        resizeRAFRef.current = 0
      }
    }
  }, [chatListRef, scheduleAutoScroll, showScrollToBottom])

  return {
    showScrollToBottom,
    isButtonFadingOut,
    scrollToBottom,
    onMessagesUpdate,
    onTyping
  }
}

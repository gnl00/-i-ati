import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { RefObject } from 'react'
import type { VirtuosoHandle } from 'react-virtuoso'
import { resolveAnchorIndex } from '@renderer/components/chat/scroll-anchor'
import { shouldAutoScrollTopOnMessageGrowth } from '@renderer/hooks/useScrollManagerTop'

type ScrollPhase = 'idle' | 'tracking_latest' | 'user_scrolled'

interface UseScrollManagerV3Props {
  messages: MessageEntity[]
  chatUuid?: string
  readStreamState: boolean
}

interface UseScrollManagerV3Return {
  scrollParentRef: RefObject<HTMLDivElement | null>
  virtuosoRef: RefObject<VirtuosoHandle | null>
  spacerHeight: number
  showJumpToLatest: boolean
  isButtonFadingOut: boolean
  onRangeChanged: (range: { startIndex: number; endIndex: number }) => void
  triggerJumpToLatest: () => void
}

export function useScrollManagerV3({
  messages,
  chatUuid,
  readStreamState
}: UseScrollManagerV3Props): UseScrollManagerV3Return {
  const scrollParentRef = useRef<HTMLDivElement>(null)
  const virtuosoRef = useRef<VirtuosoHandle>(null)

  const phaseRef = useRef<ScrollPhase>('idle')
  const [phase, setPhase] = useState<ScrollPhase>('idle')

  const spacerHeightRef = useRef<number>(0)
  const [spacerHeight, setSpacerHeight] = useState<number>(0)

  const [isButtonFadingOut, setIsButtonFadingOut] = useState<boolean>(false)

  const programmaticRef = useRef<boolean>(false)
  const programmaticTimerRef = useRef<number>(0)
  const forceScrollRafRef = useRef<number>(0)
  const smoothScrollTimerRef = useRef<number>(0)

  const messagesRef = useRef<MessageEntity[]>(messages)
  const readStreamStateRef = useRef<boolean>(readStreamState)
  const prevMessagesLengthRef = useRef<number>(messages.length)
  const lastChatUuidRef = useRef<string | undefined>(chatUuid)
  const suppressNextGrowthRef = useRef<boolean>(false)

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    readStreamStateRef.current = readStreamState
  }, [readStreamState])

  const setPhaseSync = useCallback((next: ScrollPhase) => {
    phaseRef.current = next
    setPhase(next)
    if (next !== 'user_scrolled') {
      setIsButtonFadingOut(false)
    }
  }, [])

  const markProgrammatic = useCallback((durationMs = 0) => {
    if (programmaticTimerRef.current) {
      clearTimeout(programmaticTimerRef.current)
      programmaticTimerRef.current = 0
    }

    programmaticRef.current = true

    if (durationMs > 0) {
      programmaticTimerRef.current = window.setTimeout(() => {
        programmaticRef.current = false
        programmaticTimerRef.current = 0
      }, durationMs)
      return
    }

    requestAnimationFrame(() => {
      programmaticRef.current = false
    })
  }, [])

  const scrollToIndex = useCallback((
    index: number,
    smooth = false,
    align: 'start' | 'end' = 'start'
  ) => {
    if (!virtuosoRef.current || index < 0) return

    if (smoothScrollTimerRef.current) {
      clearTimeout(smoothScrollTimerRef.current)
      smoothScrollTimerRef.current = 0
    }

    if (smooth) {
      setIsButtonFadingOut(true)
      smoothScrollTimerRef.current = window.setTimeout(() => {
        markProgrammatic(700)
        virtuosoRef.current?.scrollToIndex({ index, align, behavior: 'smooth' })
        setIsButtonFadingOut(false)
        smoothScrollTimerRef.current = 0
      }, 120)
      return
    }

    markProgrammatic()
    virtuosoRef.current.scrollToIndex({ index, align, behavior: 'auto' })
  }, [markProgrammatic])

  const measureSpacer = useCallback(() => {
    if (phaseRef.current !== 'tracking_latest') return
    const container = scrollParentRef.current
    if (!container) return

    const actualVirtuosoHeight = container.scrollHeight - spacerHeightRef.current
    const nextSpacerHeight = Math.max(
      0,
      Math.floor(container.scrollTop + container.clientHeight - actualVirtuosoHeight)
    )

    if (nextSpacerHeight !== spacerHeightRef.current) {
      spacerHeightRef.current = nextSpacerHeight
      setSpacerHeight(nextSpacerHeight)
    }
  }, [])

  useEffect(() => {
    const container = scrollParentRef.current
    if (!container || phase !== 'tracking_latest') return

    let rafId = 0
    const scheduleMeasure = () => {
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = 0
        measureSpacer()
      })
    }

    scheduleMeasure()

    const resizeObserver = new ResizeObserver(scheduleMeasure)
    resizeObserver.observe(container)

    let streamRafId = 0
    let lastMeasureTs = 0
    const streamTick = (ts: number) => {
      if (ts - lastMeasureTs >= 160) {
        lastMeasureTs = ts
        scheduleMeasure()
      }
      streamRafId = requestAnimationFrame(streamTick)
    }

    if (readStreamState) {
      streamRafId = requestAnimationFrame(streamTick)
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      if (streamRafId) cancelAnimationFrame(streamRafId)
      resizeObserver.disconnect()
    }
  }, [measureSpacer, phase, readStreamState])

  useEffect(() => {
    if (readStreamState) return

    const timerIds = [0, 50, 150, 400].map(delay =>
      window.setTimeout(() => {
        measureSpacer()
      }, delay)
    )

    return () => {
      timerIds.forEach(clearTimeout)
    }
  }, [measureSpacer, readStreamState])

  useEffect(() => {
    const container = scrollParentRef.current
    if (!container) return

    let previousScrollTop = container.scrollTop

    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY >= 0) return
      if (programmaticRef.current) return
      if (phaseRef.current === 'user_scrolled') return
      setPhaseSync('user_scrolled')
    }

    const handleScroll = () => {
      const currentScrollTop = container.scrollTop
      const isScrollingUp = currentScrollTop < previousScrollTop
      previousScrollTop = currentScrollTop

      if (!isScrollingUp) return
      if (programmaticRef.current) return
      if (phaseRef.current === 'user_scrolled') return
      setPhaseSync('user_scrolled')
    }

    container.addEventListener('wheel', handleWheel, { passive: true })
    container.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      container.removeEventListener('wheel', handleWheel)
      container.removeEventListener('scroll', handleScroll)
    }
  }, [setPhaseSync])

  useLayoutEffect(() => {
    if (lastChatUuidRef.current === chatUuid) return
    lastChatUuidRef.current = chatUuid

    prevMessagesLengthRef.current = messagesRef.current.length
    suppressNextGrowthRef.current = true

    if (forceScrollRafRef.current) {
      cancelAnimationFrame(forceScrollRafRef.current)
    }

    spacerHeightRef.current = 0
    setSpacerHeight(0)
    setPhaseSync('idle')

    forceScrollRafRef.current = requestAnimationFrame(() => {
      forceScrollRafRef.current = 0
      const messageLength = messagesRef.current.length
      if (messageLength > 0) {
        markProgrammatic()
        virtuosoRef.current?.scrollToIndex({
          index: messageLength - 1,
          align: 'end',
          behavior: 'auto'
        })
      }
    })
  }, [chatUuid, markProgrammatic, setPhaseSync])

  useEffect(() => {
    const previousLength = prevMessagesLengthRef.current
    prevMessagesLengthRef.current = messages.length

    if (messages.length <= previousLength) return

    if (suppressNextGrowthRef.current) {
      suppressNextGrowthRef.current = false
      spacerHeightRef.current = 0
      setSpacerHeight(0)
      setPhaseSync('idle')
      return
    }

    const shouldAutoScroll = shouldAutoScrollTopOnMessageGrowth(messages, previousLength, messages.length)
    if (!shouldAutoScroll) return

    if (forceScrollRafRef.current) {
      cancelAnimationFrame(forceScrollRafRef.current)
    }

    forceScrollRafRef.current = requestAnimationFrame(() => {
      forceScrollRafRef.current = 0

      const container = scrollParentRef.current
      flushSync(() => {
        const preliminarySpacerHeight = container ? container.clientHeight : 0
        spacerHeightRef.current = preliminarySpacerHeight
        setSpacerHeight(preliminarySpacerHeight)
        setPhaseSync('tracking_latest')
      })

      const targetIndex = resolveAnchorIndex(messages, 'latestUserForAutoTop')
      scrollToIndex(targetIndex, false, 'start')
    })
  }, [messages, scrollToIndex, setPhaseSync])

  const onRangeChanged = useCallback((range: { startIndex: number; endIndex: number }) => {
    if (programmaticRef.current) return

    const latestMessageIndex = messagesRef.current.length - 1
    if (latestMessageIndex < 0) return

    const latestMessageVisible = range.startIndex <= latestMessageIndex && range.endIndex >= latestMessageIndex
    if (!latestMessageVisible || phaseRef.current !== 'user_scrolled') return

    setPhaseSync(readStreamStateRef.current ? 'tracking_latest' : 'idle')
  }, [setPhaseSync])

  const triggerJumpToLatest = useCallback(() => {
    const currentMessages = messagesRef.current

    let latestAssistantIndex = -1
    for (let i = currentMessages.length - 1; i >= 0; i--) {
      if (currentMessages[i].body.role === 'assistant') {
        latestAssistantIndex = i
        break
      }
    }
    if (latestAssistantIndex < 0) return

    const targetPhase = readStreamStateRef.current ? 'tracking_latest' : 'idle'
    setPhaseSync(targetPhase)

    if (targetPhase === 'tracking_latest') {
      spacerHeightRef.current = 0
      setSpacerHeight(0)
    }

    scrollToIndex(latestAssistantIndex, true, 'start')
  }, [scrollToIndex, setPhaseSync])

  useEffect(() => {
    return () => {
      if (forceScrollRafRef.current) cancelAnimationFrame(forceScrollRafRef.current)
      if (smoothScrollTimerRef.current) clearTimeout(smoothScrollTimerRef.current)
      if (programmaticTimerRef.current) clearTimeout(programmaticTimerRef.current)
    }
  }, [])

  return {
    scrollParentRef,
    virtuosoRef,
    spacerHeight,
    showJumpToLatest: phase === 'user_scrolled',
    isButtonFadingOut,
    onRangeChanged,
    triggerJumpToLatest
  }
}

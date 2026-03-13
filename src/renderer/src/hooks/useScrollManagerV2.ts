import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { RefObject } from 'react'
import type { VirtuosoHandle } from 'react-virtuoso'
import { resolveAnchorIndex } from '@renderer/components/chat/scroll-anchor'
import { shouldAutoScrollTopOnMessageGrowth } from '@renderer/hooks/useScrollManagerTop'

// ─── Types ───────────────────────────────────────────────────────────────────

type ScrollPhase = 'idle' | 'tracking' | 'user_scrolled'

interface UseScrollManagerV2Props {
  messages: MessageEntity[]
  chatUuid?: string
  readStreamState: boolean
}

interface UseScrollManagerV2Return {
  scrollParentRef: RefObject<HTMLDivElement | null>
  virtuosoRef: RefObject<VirtuosoHandle | null>
  spacerHeight: number
  showJumpToLatest: boolean
  isButtonFadingOut: boolean
  onRangeChanged: (range: { startIndex: number; endIndex: number }) => void
  triggerJumpToLatest: () => void
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useScrollManagerV2({
  messages,
  chatUuid,
  readStreamState,
}: UseScrollManagerV2Props): UseScrollManagerV2Return {
  // DOM refs
  const scrollParentRef = useRef<HTMLDivElement>(null)
  const virtuosoRef = useRef<VirtuosoHandle>(null)

  // Phase: single source of truth for scroll state
  // ref = synchronous reads in callbacks; state = React re-render trigger
  const phaseRef = useRef<ScrollPhase>('idle')
  const [phase, setPhase] = useState<ScrollPhase>('idle')

  // Spacer height: ref for closure-safe reads; state for rendering
  const spacerHeightRef = useRef<number>(0)
  const [spacerHeight, setSpacer] = useState<number>(0)

  // Button animation state
  const [isButtonFadingOut, setFading] = useState<boolean>(false)

  // Programmatic scroll protection
  const programmaticRef = useRef<boolean>(false)
  const programmaticTimerRef = useRef<number>(0)

  // RAF / timer handles for cleanup
  const forceScrollRafRef = useRef<number>(0)
  const smoothScrollTimerRef = useRef<number>(0)

  // Stale-closure-safe references to props
  const messagesRef = useRef<MessageEntity[]>(messages)
  const readStreamStateRef = useRef<boolean>(readStreamState)

  // Track previous messages length to detect growth
  const prevMessagesLengthRef = useRef<number>(messages.length)

  // Track chatUuid to detect switches
  const lastChatUuidRef = useRef<string | undefined>(chatUuid)

  // Keep prop refs current (run before all effects that read them)
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    readStreamStateRef.current = readStreamState
  }, [readStreamState])

  // ── Phase sync ─────────────────────────────────────────────────────────────
  // Writes ref immediately (for synchronous reads) and queues state update.
  // When transitioning away from user_scrolled, clears button fade animation.
  const setPhaseSync = useCallback((next: ScrollPhase) => {
    phaseRef.current = next
    setPhase(next)
    if (next !== 'user_scrolled') {
      setFading(false)
    }
  }, [])

  // ── Programmatic scroll guard ──────────────────────────────────────────────
  // instant scroll: protected for 1 frame
  // smooth scroll: protected for durationMs (must cover animation duration)
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
    } else {
      requestAnimationFrame(() => {
        programmaticRef.current = false
      })
    }
  }, [])

  // ── Scroll to index ────────────────────────────────────────────────────────
  const scrollToIndex = useCallback(
    (index: number, smooth = false, align: 'start' | 'end' = 'start') => {
      if (!virtuosoRef.current || index < 0) return

      if (smoothScrollTimerRef.current) {
        clearTimeout(smoothScrollTimerRef.current)
        smoothScrollTimerRef.current = 0
      }

      if (smooth) {
        setFading(true)
        smoothScrollTimerRef.current = window.setTimeout(() => {
          // Protect the entire smooth animation duration (~300ms) plus buffer
          markProgrammatic(700)
          virtuosoRef.current?.scrollToIndex({ index, align, behavior: 'smooth' })
          setFading(false)
          smoothScrollTimerRef.current = 0
        }, 120)
        return
      }

      markProgrammatic()
      virtuosoRef.current.scrollToIndex({ index, align, behavior: 'auto' })
    },
    [markProgrammatic]
  )

  // ── Spacer measurement ─────────────────────────────────────────────────────
  // Uses actual DOM values instead of Virtuoso range estimates.
  // Formula: actualVirtuosoHeight = scrollHeight - currentSpacer
  //          needed = scrollTop + clientHeight - actualVirtuosoHeight
  // As assistant content grows, scrollHeight grows → needed shrinks → spacer shrinks to 0.
  const measureSpacer = useCallback(() => {
    if (phaseRef.current !== 'tracking') return
    const container = scrollParentRef.current
    if (!container) return

    const actualVirtuosoHeight = container.scrollHeight - spacerHeightRef.current
    const needed = Math.max(
      0,
      Math.floor(container.scrollTop + container.clientHeight - actualVirtuosoHeight)
    )

    if (needed !== spacerHeightRef.current) {
      spacerHeightRef.current = needed
      setSpacer(needed)
    }
  }, [])

  // ── Spacer scheduling ──────────────────────────────────────────────────────
  // Active only during TRACKING phase.
  // - ResizeObserver: catches container border-box resize (window / panel resize)
  // - rAF loop: polls during streaming (content grows frequently; scrollHeight
  //   is NOT reported by ResizeObserver, so polling is the only reliable way)
  useEffect(() => {
    const container = scrollParentRef.current
    if (!container || phase !== 'tracking') return

    let rafId = 0
    const schedule = () => {
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = 0
        measureSpacer()
      })
    }

    // Immediate first measurement
    schedule()

    // Catch window / panel resizes (container clientHeight changes)
    const ro = new ResizeObserver(schedule)
    ro.observe(container)

    // During streaming, content grows rapidly → poll at ~160ms intervals.
    // NOTE: ResizeObserver on the container does NOT fire when Virtuoso's
    // inner scrollHeight changes, so the rAF poll is the only mechanism that
    // tracks content growth during streaming.
    let streamRaf = 0
    let lastTs = 0
    const tick = (ts: number) => {
      if (ts - lastTs >= 160) {
        lastTs = ts
        schedule()
      }
      streamRaf = requestAnimationFrame(tick)
    }
    if (readStreamState) {
      streamRaf = requestAnimationFrame(tick)
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      if (streamRaf) cancelAnimationFrame(streamRaf)
      ro.disconnect()
    }
  }, [phase, readStreamState, measureSpacer])

  // ── Post-stream re-measurement ─────────────────────────────────────────────
  // When streaming ends, Virtuoso items may re-render at different heights
  // (markdown completes, typewriter cursor removed, code blocks syntax-highlight,
  // etc.).  The container's ResizeObserver does NOT observe scrollHeight, so
  // those height changes are invisible to it.  Schedule several measurements
  // in the frames/ticks after stream end to correct the spacer.
  // measureSpacer() is a no-op when phase ≠ 'tracking', so these are safe
  // to fire even if the phase has already transitioned.
  useEffect(() => {
    if (readStreamState) return   // only act when streaming just ended

    const ids = [0, 50, 150, 400].map(d =>
      window.setTimeout(() => { measureSpacer() }, d)
    )
    return () => { ids.forEach(clearTimeout) }
  }, [readStreamState, measureSpacer])

  // ── User scroll-up detection ───────────────────────────────────────────────
  // wheel: deltaY < 0 = scroll wheel up (always user-initiated, never programmatic)
  // scroll: compare scrollTop to detect upward movement (guards against programmatic)
  useEffect(() => {
    const container = scrollParentRef.current
    if (!container) return

    let prevScrollTop = container.scrollTop

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY >= 0) return
      if (programmaticRef.current) return
      if (phaseRef.current === 'user_scrolled') return
      setPhaseSync('user_scrolled')
    }

    const onScroll = () => {
      const cur = container.scrollTop
      const isUp = cur < prevScrollTop
      prevScrollTop = cur
      if (!isUp) return
      if (programmaticRef.current) return
      if (phaseRef.current === 'user_scrolled') return
      setPhaseSync('user_scrolled')
    }

    container.addEventListener('wheel', onWheel, { passive: true })
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      container.removeEventListener('wheel', onWheel)
      container.removeEventListener('scroll', onScroll)
    }
  }, [setPhaseSync])

  // ── Chat UUID switch ───────────────────────────────────────────────────────
  // Reset to idle + scroll to bottom of history.
  // Also resets prevMessagesLengthRef to suppress auto-scroll for existing messages.
  // Must be defined BEFORE messages growth effect so it runs first in same commit.
  useEffect(() => {
    if (lastChatUuidRef.current === chatUuid) return
    lastChatUuidRef.current = chatUuid

    // Suppress auto-scroll for the new chat's pre-existing messages
    prevMessagesLengthRef.current = messagesRef.current.length

    if (forceScrollRafRef.current) cancelAnimationFrame(forceScrollRafRef.current)
    spacerHeightRef.current = 0
    setSpacer(0)
    setPhaseSync('idle')

    // Scroll to end of history on next frame (DOM may not be ready yet)
    forceScrollRafRef.current = requestAnimationFrame(() => {
      forceScrollRafRef.current = 0
      const len = messagesRef.current.length
      if (len > 0) {
        markProgrammatic()
        virtuosoRef.current?.scrollToIndex({ index: len - 1, align: 'end', behavior: 'auto' })
      }
    })
  }, [chatUuid, markProgrammatic, setPhaseSync])

  // ── Messages growth detection ──────────────────────────────────────────────
  // Only triggers auto-scroll when a NEW USER message is appended.
  // Stream chunks don't add new items → no auto-scroll during streaming.
  useEffect(() => {
    const prev = prevMessagesLengthRef.current
    prevMessagesLengthRef.current = messages.length

    if (messages.length <= prev) return

    const shouldAutoScroll = shouldAutoScrollTopOnMessageGrowth(messages, prev, messages.length)
    if (!shouldAutoScroll) return

    if (forceScrollRafRef.current) cancelAnimationFrame(forceScrollRafRef.current)
    forceScrollRafRef.current = requestAnimationFrame(() => {
      forceScrollRafRef.current = 0

      const container = scrollParentRef.current

      // flushSync is required here: scrollToIndex fires synchronously, so the
      // spacer must already be in the DOM before the scroll attempt.
      // Without it, setSpacer is async and the DOM still has the old spacer
      // (typically 0) when scrollToIndex runs.  With 0 spacer and short content,
      // maxScrollTop = contentHeight - clientHeight may be less than the target
      // item's Y position, so the scroll gets capped and the user message never
      // reaches the top.  Setting spacer = clientHeight guarantees enough room.
      flushSync(() => {
        const preliminarySpacer = container ? container.clientHeight : 0
        spacerHeightRef.current = preliminarySpacer
        setSpacer(preliminarySpacer)
        setPhaseSync('tracking')
      })

      // Scroll to latest user message (skip assistant placeholder if present)
      const targetIdx = resolveAnchorIndex(messages, 'latestUserForAutoTop')
      scrollToIndex(targetIdx, false, 'start')

      // measureSpacer (scheduled by the tracking effect's ResizeObserver / rAF)
      // will correct the spacer to its precise value after the scroll settles.
    })
  }, [messages, scrollToIndex, setPhaseSync])

  // ── Range change: detect manual scroll back to latest ─────────────────────
  const onRangeChanged = useCallback(
    (range: { startIndex: number; endIndex: number }) => {
      // Ignore during programmatic scrolls (smooth jump animation)
      if (programmaticRef.current) return

      const latestIdx = messagesRef.current.length - 1
      if (latestIdx < 0) return

      const visible = range.startIndex <= latestIdx && range.endIndex >= latestIdx
      if (!visible || phaseRef.current !== 'user_scrolled') return

      // User manually scrolled back to see the latest message
      setPhaseSync(readStreamStateRef.current ? 'tracking' : 'idle')
    },
    [setPhaseSync]
  )

  // ── Jump to latest ─────────────────────────────────────────────────────────
  const triggerJumpToLatest = useCallback(() => {
    const msgs = messagesRef.current

    // Find last assistant message
    let lastAssistantIdx = -1
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].body.role === 'assistant') {
        lastAssistantIdx = i
        break
      }
    }
    if (lastAssistantIdx < 0) return

    const targetPhase = readStreamStateRef.current ? 'tracking' : 'idle'
    setPhaseSync(targetPhase)

    // If re-entering tracking, reset spacer so scheduling effect remeasures
    if (targetPhase === 'tracking') {
      spacerHeightRef.current = 0
      setSpacer(0)
    }

    scrollToIndex(lastAssistantIdx, true, 'start')
  }, [scrollToIndex, setPhaseSync])

  // ── Global cleanup ─────────────────────────────────────────────────────────
  useEffect(
    () => () => {
      if (forceScrollRafRef.current) cancelAnimationFrame(forceScrollRafRef.current)
      if (smoothScrollTimerRef.current) clearTimeout(smoothScrollTimerRef.current)
      if (programmaticTimerRef.current) clearTimeout(programmaticTimerRef.current)
    },
    []
  )

  return {
    scrollParentRef,
    virtuosoRef,
    spacerHeight,
    showJumpToLatest: phase === 'user_scrolled',
    isButtonFadingOut,
    onRangeChanged,
    triggerJumpToLatest,
  }
}

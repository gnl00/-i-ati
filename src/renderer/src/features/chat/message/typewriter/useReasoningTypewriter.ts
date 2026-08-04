import { useCallback, useEffect, useRef, useState } from 'react'
import { tokenizeText } from '@renderer/shared/lib/tokenizeText'

const TOKEN_CADENCE_MS = 28
const REACT_UPDATE_INTERVAL_MS = 32
const TYPING_CHANGE_INTERVAL_MS = 50

export interface UseReasoningTypewriterOptions {
  segmentId: string
  content: string
  enabled: boolean
  isStreaming: boolean
  reducedMotion?: boolean
  onTypingChange?: () => void
}

export interface ReasoningTypewriterState {
  visibleContent: string
  isTyping: boolean
}

const getTokenBatchSize = (backlog: number): number => {
  if (backlog > 48) return 4
  if (backlog >= 17) return 2
  return 1
}

export function useReasoningTypewriter({
  segmentId,
  content,
  enabled,
  isStreaming,
  reducedMotion = false,
  onTypingChange
}: UseReasoningTypewriterOptions): ReasoningTypewriterState {
  const shouldSynchronize = !enabled || !isStreaming || reducedMotion
  const initialContent = shouldSynchronize ? content : ''
  const initialState = {
    visibleContent: initialContent,
    isTyping: !shouldSynchronize && content.length > 0
  }
  const [state, setState] = useState<ReasoningTypewriterState>(initialState)
  const stateRef = useRef<ReasoningTypewriterState>(initialState)
  const segmentIdRef = useRef(segmentId)
  const targetContentRef = useRef(shouldSynchronize ? content : '')
  const revealedContentRef = useRef(initialContent)
  const pendingTokensRef = useRef<string[]>([])
  const animationFrameRef = useRef<number | null>(null)
  const lastTokenAtRef = useRef<number | null>(null)
  const lastVisibleUpdateAtRef = useRef<number | null>(null)
  const lastTypingChangeAtRef = useRef<number | null>(null)
  const runFrameRef = useRef<(timestamp: number) => void>(() => undefined)
  const inputRef = useRef({ enabled, isStreaming, reducedMotion, onTypingChange })

  inputRef.current = { enabled, isStreaming, reducedMotion, onTypingChange }

  const cancelPlayback = useCallback((): void => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    lastTokenAtRef.current = null
  }, [])

  const publish = useCallback((
    visibleContent: string,
    isTyping: boolean,
    timestamp?: number,
    notifyTypingChange = false
  ): void => {
    const contentChanged = stateRef.current.visibleContent !== visibleContent
    const typingChanged = stateRef.current.isTyping !== isTyping

    if (contentChanged || typingChanged) {
      const nextState = { visibleContent, isTyping }
      stateRef.current = nextState
      setState(nextState)
    }

    if (contentChanged && timestamp != null) {
      lastVisibleUpdateAtRef.current = timestamp
    }

    if (!contentChanged || !notifyTypingChange) return

    const callback = inputRef.current.onTypingChange
    if (!callback) return

    const lastTypingChangeAt = lastTypingChangeAtRef.current
    if (lastTypingChangeAt !== null && timestamp != null
      && timestamp - lastTypingChangeAt < TYPING_CHANGE_INTERVAL_MS) {
      return
    }

    lastTypingChangeAtRef.current = timestamp ?? performance.now()
    callback()
  }, [])

  const scheduleFrame = useCallback((): void => {
    if (animationFrameRef.current !== null) return

    animationFrameRef.current = requestAnimationFrame((timestamp) => {
      animationFrameRef.current = null
      runFrameRef.current(timestamp)
    })
  }, [])

  runFrameRef.current = (timestamp: number): void => {
    const { enabled: playbackEnabled, isStreaming: streaming, reducedMotion: prefersReducedMotion } = inputRef.current
    if (!playbackEnabled || !streaming || prefersReducedMotion) return

    const pendingTokens = pendingTokensRef.current
    const lastTokenAt = lastTokenAtRef.current

    if (pendingTokens.length > 0 && (lastTokenAt === null || timestamp - lastTokenAt >= TOKEN_CADENCE_MS)) {
      const tokenBatch = pendingTokens.splice(0, getTokenBatchSize(pendingTokens.length))
      revealedContentRef.current += tokenBatch.join('')
      lastTokenAtRef.current = timestamp
    }

    const hasPendingTokens = pendingTokens.length > 0
    const hasUnpublishedContent = stateRef.current.visibleContent !== revealedContentRef.current
    const lastVisibleUpdateAt = lastVisibleUpdateAtRef.current
    const canPublish = lastVisibleUpdateAt === null
      || timestamp - lastVisibleUpdateAt >= REACT_UPDATE_INTERVAL_MS

    if (hasUnpublishedContent && canPublish) {
      publish(revealedContentRef.current, hasPendingTokens, timestamp, true)
    } else if (!hasPendingTokens && !hasUnpublishedContent && stateRef.current.isTyping) {
      publish(revealedContentRef.current, false)
    }

    if (hasPendingTokens || hasUnpublishedContent) {
      scheduleFrame()
    }
  }

  useEffect(() => {
    const nextShouldSynchronize = !enabled || !isStreaming || reducedMotion
    const segmentChanged = segmentIdRef.current !== segmentId

    if (segmentChanged) {
      cancelPlayback()
      segmentIdRef.current = segmentId
      targetContentRef.current = content
      pendingTokensRef.current = []
      lastVisibleUpdateAtRef.current = null
      lastTypingChangeAtRef.current = null

      if (nextShouldSynchronize) {
        revealedContentRef.current = content
        publish(content, false)
        return
      }

      revealedContentRef.current = ''
      pendingTokensRef.current = tokenizeText(content)
      publish('', pendingTokensRef.current.length > 0)
      if (pendingTokensRef.current.length > 0) scheduleFrame()
      return
    }

    if (nextShouldSynchronize) {
      cancelPlayback()
      targetContentRef.current = content
      pendingTokensRef.current = []
      revealedContentRef.current = content
      publish(content, false)
      return
    }

    const previousContent = targetContentRef.current
    if (content === previousContent) {
      if (pendingTokensRef.current.length > 0) scheduleFrame()
      return
    }

    targetContentRef.current = content
    if (!content.startsWith(previousContent)) {
      cancelPlayback()
      pendingTokensRef.current = []
      revealedContentRef.current = content
      publish(content, false)
      return
    }

    const appendedText = content.slice(previousContent.length)
    if (!appendedText) return

    const wasCaughtUp = pendingTokensRef.current.length === 0
    pendingTokensRef.current.push(...tokenizeText(appendedText))
    if (wasCaughtUp) lastTokenAtRef.current = null
    publish(revealedContentRef.current, true)
    scheduleFrame()
  }, [
    cancelPlayback,
    content,
    enabled,
    isStreaming,
    publish,
    reducedMotion,
    scheduleFrame,
    segmentId
  ])

  useEffect(() => cancelPlayback, [cancelPlayback])

  return state
}

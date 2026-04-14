import { ArtifactsPanel, FloatingArtifactsToggle } from '@renderer/components/artifacts'
import ChatHeaderComponent from "@renderer/components/chat/ChatHeaderComponent"
import ChatInputArea from "@renderer/components/chat/chatInput/ChatInputArea"
import ChatMessageComponent from "@renderer/components/chat/chatMessage/ChatMessageComponent"
import WelcomeMessage from "@renderer/components/chat/welcome/WelcomeMessageNext2"
import { useScrollManagerTop, type UserScrollSource } from '@renderer/hooks/useScrollManagerTop'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@renderer/components/ui/resizable'
import { cn } from '@renderer/lib/utils'
import { useChatStore } from '@renderer/store/chatStore'
import { ArrowDown } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Virtuoso, type StateSnapshot } from 'react-virtuoso'
import { resolveAnchorIndex } from './scroll-anchor'
import { TaskPlanBar } from './task/TaskPlanBar'
import { useTaskPlan } from '@renderer/hooks/useTaskPlan'
import { useSubagentRuntime } from '@renderer/hooks/useSubagentRuntime'
import { useToolConfirmations } from '@renderer/hooks/useToolConfirmations'
import { useScheduleNotifications } from '@renderer/hooks/useScheduleNotifications'

const STREAMING_FOLLOW_RESTORE_THRESHOLD_PX = 24
type ScrollMode = 'tail-follow' | 'anchor-lock' | 'manual'

const STABLE_SPACER_REASONS = new Set([
  'user-sent',
  'conversation-switch',
  'container-mounted',
  'container-resize',
  'total-list-height-changed'
])

const ChatMessageRow: React.FC<{
  messageIndex: number
  message: MessageEntity
  previewMessage?: ChatMessage
  lastAssistantIndex: number
  lastMessageIndex: number
  onTypingChange?: () => void
}> = memo(({ messageIndex, message, previewMessage, lastAssistantIndex, lastMessageIndex, onTypingChange }) => {
  const isLatest = message.body.role === 'assistant'
    ? messageIndex === lastAssistantIndex
    : messageIndex === lastMessageIndex

  return (
    <ChatMessageComponent
      message={message.body}
      previewMessage={previewMessage}
      index={messageIndex}
      isLatest={isLatest}
      onTypingChange={onTypingChange}
    />
  )
})

const ChatWindowComponentNext: React.FC = () => {
  const messages = useChatStore(state => state.messages)
  const previewMessage = useChatStore(state => state.preview.message)
  const artifactsPanelOpen = useChatStore(state => state.artifactsPanelOpen)
  const setArtifactsPanel = useChatStore(state => state.setArtifactsPanel)
  const chatUuid = useChatStore(state => state.currentChatUuid ?? undefined)
  const runPhase = useChatStore(state => state.runPhase)
  const scrollHint = useChatStore(state => state.scrollHint)
  const clearScrollHint = useChatStore(state => state.clearScrollHint)
  const patchMessageUiState = useChatStore(state => state.patchMessageUiState)
  const upsertMessage = useChatStore(state => state.upsertMessage)
  const onUserScrollIntentRef = useRef<((source: UserScrollSource) => void) | null>(null)
  const onUserScrollUpIntentRef = useRef<((source: UserScrollSource) => void) | null>(null)
  const committedLastAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].body.role === 'assistant') {
        return i
      }
    }
    return -1
  }, [messages])
  const previewStandalone = Boolean(previewMessage) && committedLastAssistantIndex < 0
  const previewRenderIndex = previewMessage
    ? (previewStandalone ? messages.length : committedLastAssistantIndex)
    : -1
  const displayMessages = useMemo(
    () => (previewStandalone && previewMessage ? [...messages, previewMessage] : messages),
    [messages, previewStandalone, previewMessage]
  )
  const lastAssistantIndex = previewRenderIndex >= 0 ? previewRenderIndex : committedLastAssistantIndex

  const isRunStreaming = runPhase === 'streaming'
  const inputAreaRef = useRef<HTMLDivElement>(null)
  const latestVisibleRef = useRef<boolean>(true)
  const scrollModeRef = useRef<ScrollMode>('tail-follow')
  const lockedAnchorMessageIdRef = useRef<number | null>(null)
  const hasInitialAnchorScrollDoneRef = useRef<boolean>(true)
  const suppressScrollIntentRef = useRef<boolean>(false)
  const suppressScrollIntentReleaseRafRef = useRef<number>(0)
  const {
    scrollParentRef,
    virtuosoRef,
    showJumpToLatest,
    isButtonFadingOut,
    scrollToMessageIndex,
    onRangeChanged
  } = useScrollManagerTop({
    messagesLength: displayMessages.length,
    chatUuid,
    onUserScrollIntentRef,
    onUserScrollUpIntentRef,
    suppressScrollIntentRef,
    onLatestVisibleChange: (visible) => {
      if (
        visible
        && isRunStreaming
        && !latestVisibleRef.current
        && scrollModeRef.current === 'manual'
      ) {
        scrollModeRef.current = 'tail-follow'
      }
      latestVisibleRef.current = visible
    }
  })

  const lastMessageIndex = displayMessages.length - 1

  // Welcome page state
  const [showWelcome, setShowWelcome] = useState<boolean>(true)
  const [isWelcomeExiting, setIsWelcomeExiting] = useState<boolean>(false)
  const [bottomSpacerHeight, setBottomSpacerHeight] = useState<number>(0)
  const [disableTailSpacer, setDisableTailSpacer] = useState<boolean>(false)
  const hasShownWelcomeRef = useRef<boolean>(false)
  const spacerDisabledAtLengthRef = useRef<number>(0)
  const disableTailSpacerRef = useRef<boolean>(false)
  const spacerHeightRef = useRef<number>(0)
  const layoutPassRafRef = useRef<number>(0)
  const latestLayoutReasonRef = useRef<string | null>(null)
  const { activePlans, pendingPlanReview, approvePlanReview, abortPlanReview, refreshPlans } = useTaskPlan(chatUuid)
  useToolConfirmations(chatUuid)
  useSubagentRuntime(chatUuid)
  useScheduleNotifications(chatUuid)
  const displayPlans = pendingPlanReview
    ? [pendingPlanReview.plan, ...activePlans]
    : activePlans

  const autoTopAnchorIndex = resolveAnchorIndex(displayMessages, 'latestUserForAutoTop')
  const latestMessageIndex = resolveAnchorIndex(displayMessages, 'latestMessage')
  const resolveLockedAnchor = useCallback(() => {
    const lockedAnchorMessageId = lockedAnchorMessageIdRef.current
    if (lockedAnchorMessageId === null) return null

    const index = displayMessages.findIndex(message => message.id === lockedAnchorMessageId)
    if (index < 0) return null

    return {
      messageId: lockedAnchorMessageId,
      index
    }
  }, [displayMessages])

  const getLockedAnchorElement = useCallback(() => {
    const container = scrollParentRef.current
    const lockedAnchor = resolveLockedAnchor()
    if (!container || !lockedAnchor) return null

    return container.querySelector<HTMLElement>(`[data-message-id="${lockedAnchor.messageId}"]`)
      ?? container.querySelector<HTMLElement>(`[data-index="${lockedAnchor.index}"]`)
  }, [resolveLockedAnchor, scrollParentRef])

  const getLockedAnchorViewportTop = useCallback(() => {
    const container = scrollParentRef.current
    const anchorElement = getLockedAnchorElement()
    if (!container || !anchorElement) return null

    return anchorElement.getBoundingClientRect().top - container.getBoundingClientRect().top
  }, [getLockedAnchorElement, scrollParentRef])
  const renderedLatestAssistant = useMemo(() => {
    if (lastAssistantIndex < 0) return undefined
    if (previewMessage && previewRenderIndex === lastAssistantIndex) {
      return previewMessage
    }
    return displayMessages[lastAssistantIndex]
  }, [displayMessages, lastAssistantIndex, previewRenderIndex, previewMessage])
  const latestAssistantTextSignature = useMemo(() => {
    if (!renderedLatestAssistant) return ''
    const latestAssistant = renderedLatestAssistant
    const segments = latestAssistant?.body?.segments ?? []

    return segments
      .filter((segment): segment is TextSegment => segment.type === 'text')
      .map((segment) => `${segment.timestamp}:${segment.content.length}`)
      .join('|')
  }, [renderedLatestAssistant])
  const latestAssistantNonTextSignature = useMemo(() => {
    if (!renderedLatestAssistant) return ''
    const latestAssistant = renderedLatestAssistant
    const segments = latestAssistant?.body?.segments ?? []

    return segments
      .map((segment) => {
        switch (segment.type) {
          case 'text':
            return ''
          case 'toolCall': {
            const status = typeof segment.content?.status === 'string' ? segment.content.status : ''
            const resultShape = segment.isError
              ? `err:${String(segment.content?.error || '')}`
              : `ok:${segment.content?.result ? '1' : '0'}:${segment.content?.raw ? '1' : '0'}`
            return `tool:${segment.toolCallId || segment.name}:${status}:${resultShape}:${segment.timestamp}`
          }
          case 'reasoning':
            return `reasoning:${segment.timestamp}:${segment.content.length}`
          case 'error':
            return `error:${segment.error.timestamp}:${segment.error.message}`
          default:
            return ''
        }
      })
      .filter(Boolean)
      .join('|')
  }, [renderedLatestAssistant])

  const readVirtuosoState = useCallback((): StateSnapshot | null => {
    let snapshot: StateSnapshot | null = null
    virtuosoRef.current?.getState((state) => {
      snapshot = state
    })
    return snapshot
  }, [virtuosoRef])

  const getIndexMetrics = useCallback((targetIndex: number): { top: number; height: number; bottom: number } | null => {
    if (targetIndex < 0) return null

    const container = scrollParentRef.current
    if (container) {
      const itemElement = container.querySelector<HTMLElement>(`[data-index="${targetIndex}"]`)
      if (itemElement) {
        const containerRect = container.getBoundingClientRect()
        const itemRect = itemElement.getBoundingClientRect()
        const top = itemRect.top - containerRect.top + container.scrollTop
        const height = itemRect.height

        if (height > 0) {
          return { top, height, bottom: top + height }
        }
      }
    }

    const snapshot = readVirtuosoState()
    if (!snapshot || !Array.isArray(snapshot.ranges) || snapshot.ranges.length === 0) {
      return null
    }

    const ranges = snapshot.ranges
    let top = 0
    let height = 0

    for (const range of ranges) {
      const rangeStart = range.startIndex
      const rangeEnd = range.endIndex
      if (rangeEnd < targetIndex) {
        top += (rangeEnd - rangeStart + 1) * range.size
        continue
      }
      if (rangeStart > targetIndex) {
        break
      }
      top += Math.max(0, targetIndex - rangeStart) * range.size
      height = range.size
      break
    }

    if (height <= 0) return null
    return { top, height, bottom: top + height }
  }, [readVirtuosoState])

  const getLatestMessageMetrics = useCallback(() => {
    return getIndexMetrics(latestMessageIndex)
  }, [getIndexMetrics, latestMessageIndex])

  const getLockedAnchorTailMetrics = useCallback((): {
    anchorTop: number
    anchorHeight: number
    latestBottom: number
    tailHeight: number
    anchorIndex: number
    anchorMessageId: number
  } | null => {
    const lockedAnchor = resolveLockedAnchor()
    if (!lockedAnchor) return null

    const anchorElement = getLockedAnchorElement()
    let anchorMetrics: { top: number; height: number; bottom: number } | null = null
    if (anchorElement) {
      const container = scrollParentRef.current
      if (!container) return null

      const containerRect = container.getBoundingClientRect()
      const itemRect = anchorElement.getBoundingClientRect()
      const top = itemRect.top - containerRect.top + container.scrollTop
      const height = itemRect.height

      if (height > 0) {
        anchorMetrics = { top, height, bottom: top + height }
      }
    }

    if (!anchorMetrics) {
      anchorMetrics = getIndexMetrics(lockedAnchor.index)
    }
    const latestMetrics = getIndexMetrics(latestMessageIndex)

    if (!anchorMetrics || !latestMetrics) {
      return null
    }

    return {
      anchorTop: anchorMetrics.top,
      anchorHeight: anchorMetrics.height,
      latestBottom: latestMetrics.bottom,
      tailHeight: Math.max(anchorMetrics.height, latestMetrics.bottom - anchorMetrics.top),
      anchorIndex: lockedAnchor.index,
      anchorMessageId: lockedAnchor.messageId
    }
  }, [getIndexMetrics, getLockedAnchorElement, latestMessageIndex, resolveLockedAnchor, scrollParentRef])

  const commitBottomSpacerHeight = useCallback((nextHeight: number) => {
    if (nextHeight === spacerHeightRef.current) return false
    spacerHeightRef.current = nextHeight
    setBottomSpacerHeight(nextHeight)
    return true
  }, [])

  const suppressUserScrollIntent = useCallback((frames = 2) => {
    suppressScrollIntentRef.current = true
    if (suppressScrollIntentReleaseRafRef.current) {
      cancelAnimationFrame(suppressScrollIntentReleaseRafRef.current)
      suppressScrollIntentReleaseRafRef.current = 0
    }

    const releaseAfterFrames = (remainingFrames: number) => {
      suppressScrollIntentReleaseRafRef.current = requestAnimationFrame(() => {
        if (remainingFrames <= 1) {
          suppressScrollIntentReleaseRafRef.current = 0
          suppressScrollIntentRef.current = false
          return
        }
        releaseAfterFrames(remainingFrames - 1)
      })
    }

    releaseAfterFrames(Math.max(1, frames))
  }, [])

  const computeAnchorLockLayout = useCallback(() => {
    const container = scrollParentRef.current
    if (!container) return null

    const tailMetrics = getLockedAnchorTailMetrics()
    if (!tailMetrics) return null

    const viewportHeight = container.clientHeight
    const requiredViewportFill = Math.max(0, Math.floor(viewportHeight - tailMetrics.tailHeight))

    return {
      viewportHeight,
      requiredViewportFill,
      nextBottomSpacerHeight: requiredViewportFill,
      tailMetrics
    }
  }, [getLockedAnchorTailMetrics, scrollParentRef])

  const runLayoutPass = useCallback((reason: string) => {
    const container = scrollParentRef.current
    if (!container) return

    const mode = scrollModeRef.current

    if (disableTailSpacerRef.current || mode !== 'anchor-lock') {
      const didResetSpacer = commitBottomSpacerHeight(0)
      if (didResetSpacer) {
        suppressUserScrollIntent()
      }
      return
    }

    const layout = computeAnchorLockLayout()
    if (!layout) return

    const currentSpacerHeight = spacerHeightRef.current
    const canShrinkSpacer = STABLE_SPACER_REASONS.has(reason)
    const nextBottomSpacerHeight = layout.nextBottomSpacerHeight < currentSpacerHeight && !canShrinkSpacer
      ? currentSpacerHeight
      : layout.nextBottomSpacerHeight

    const didUpdateSpacer = commitBottomSpacerHeight(nextBottomSpacerHeight)
    if (didUpdateSpacer) {
      suppressUserScrollIntent()
    }
    if (!hasInitialAnchorScrollDoneRef.current) return

    const currentTop = getLockedAnchorViewportTop()
    if (currentTop === null || Math.abs(currentTop) < 0.5) return

    suppressUserScrollIntent()
    container.scrollTop += currentTop
  }, [
    commitBottomSpacerHeight,
    computeAnchorLockLayout,
    getLockedAnchorViewportTop,
    scrollParentRef,
    suppressUserScrollIntent,
  ])

  const requestLayoutPass = useCallback((reason: string) => {
    latestLayoutReasonRef.current = reason
    if (layoutPassRafRef.current) return

    layoutPassRafRef.current = requestAnimationFrame(() => {
      layoutPassRafRef.current = 0
      const nextReason = latestLayoutReasonRef.current ?? reason
      latestLayoutReasonRef.current = null
      runLayoutPass(nextReason)
    })
  }, [runLayoutPass])

  const cancelScheduledLayoutPass = useCallback(() => {
    latestLayoutReasonRef.current = null
    if (!layoutPassRafRef.current) return
    cancelAnimationFrame(layoutPassRafRef.current)
    layoutPassRafRef.current = 0
  }, [])

  useEffect(() => {
    if (scrollHint.type === 'none') return
    if (scrollHint.chatUuid !== (chatUuid ?? null)) return

    if (scrollHint.type === 'conversation-switch') {
      cancelScheduledLayoutPass()
      lockedAnchorMessageIdRef.current = null
      hasInitialAnchorScrollDoneRef.current = true
      scrollModeRef.current = 'tail-follow'
      return
    }
  }, [autoTopAnchorIndex, cancelScheduledLayoutPass, chatUuid, displayMessages, scrollHint])

  useLayoutEffect(() => {
    if (scrollHint.type !== 'conversation-switch') return
    if (scrollHint.chatUuid !== (chatUuid ?? null)) return
    if (displayMessages.length <= 0) {
      clearScrollHint()
      return
    }

    const targetIndex = Math.min(scrollHint.index, Math.max(displayMessages.length - 1, 0))
    lockedAnchorMessageIdRef.current = null
    hasInitialAnchorScrollDoneRef.current = true
    scrollModeRef.current = 'tail-follow'
    clearScrollHint()
    requestAnimationFrame(() => {
      scrollToMessageIndex(targetIndex, false, scrollHint.align)
      requestAnimationFrame(() => {
        requestLayoutPass('conversation-switch')
      })
    })
  }, [
    chatUuid,
    clearScrollHint,
    displayMessages.length,
    requestLayoutPass,
    scrollHint,
    scrollToMessageIndex
  ])

  useLayoutEffect(() => {
    if (scrollHint.type !== 'user-sent') return
    if (scrollHint.chatUuid !== (chatUuid ?? null)) return

    const anchorIndex = scrollHint.messageId !== undefined
      ? displayMessages.findIndex(message => message.id === scrollHint.messageId)
      : -1
    const resolvedAnchorIndex = scrollHint.messageId !== undefined
      ? anchorIndex
      : autoTopAnchorIndex
    if (scrollHint.messageId !== undefined && anchorIndex < 0) {
      return
    }
    if (resolvedAnchorIndex < 0) return

    cancelScheduledLayoutPass()
    lockedAnchorMessageIdRef.current = displayMessages[resolvedAnchorIndex]?.id ?? scrollHint.messageId ?? null
    if (lockedAnchorMessageIdRef.current === null) {
      hasInitialAnchorScrollDoneRef.current = true
      scrollModeRef.current = 'tail-follow'
      clearScrollHint()
      scrollToMessageIndex(resolvedAnchorIndex, false, 'start')
      return
    }
    hasInitialAnchorScrollDoneRef.current = true
    scrollModeRef.current = 'anchor-lock'

    if (disableTailSpacerRef.current) {
      disableTailSpacerRef.current = false
      setDisableTailSpacer(false)
    }

    clearScrollHint()
    const container = scrollParentRef.current
    let initialSpacerHeight = spacerHeightRef.current
    if (container) {
      initialSpacerHeight = container.clientHeight
      suppressUserScrollIntent(4)
      commitBottomSpacerHeight(initialSpacerHeight)
    }
    requestAnimationFrame(() => {
      suppressUserScrollIntent(4)
      scrollToMessageIndex(resolvedAnchorIndex, false, 'start')
      requestAnimationFrame(() => {
        requestLayoutPass('user-sent')
      })
    })
  }, [
    autoTopAnchorIndex,
    cancelScheduledLayoutPass,
    chatUuid,
    clearScrollHint,
    commitBottomSpacerHeight,
    displayMessages,
    requestLayoutPass,
    scrollParentRef,
    scrollHint,
    scrollToMessageIndex,
    suppressUserScrollIntent,
  ])

  useEffect(() => {
    onUserScrollIntentRef.current = () => {
      if (!isRunStreaming) return

      cancelScheduledLayoutPass()
      scrollModeRef.current = 'manual'
      lockedAnchorMessageIdRef.current = null
      hasInitialAnchorScrollDoneRef.current = true
      const container = scrollParentRef.current
      if (!container) return

      const latestMetrics = getLatestMessageMetrics()
      if (!latestMetrics) return

      const viewportBottom = container.scrollTop + container.clientHeight
      const nearLatestBottom = viewportBottom >= latestMetrics.bottom - STREAMING_FOLLOW_RESTORE_THRESHOLD_PX

      if (nearLatestBottom) {
        scrollModeRef.current = 'tail-follow'
      }
    }

    return () => {
      onUserScrollIntentRef.current = null
    }
  }, [cancelScheduledLayoutPass, chatUuid, getLatestMessageMetrics, isRunStreaming, scrollParentRef])

  useEffect(() => {
    onUserScrollUpIntentRef.current = () => {
      const container = scrollParentRef.current
      if (!container) return
      if (isRunStreaming) {
        cancelScheduledLayoutPass()
        scrollModeRef.current = 'manual'
        lockedAnchorMessageIdRef.current = null
        hasInitialAnchorScrollDoneRef.current = true
        return
      }

      const latestMetrics = getLatestMessageMetrics()
      if (!latestMetrics) return
      const viewportBottom = container.scrollTop + container.clientHeight
      // Only when the viewport has fully moved past the tail spacer
      // (i.e. no spacer area remains visible).
      if (viewportBottom > latestMetrics.bottom + 1) return

      cancelScheduledLayoutPass()
      scrollModeRef.current = 'manual'
      lockedAnchorMessageIdRef.current = null
      hasInitialAnchorScrollDoneRef.current = true
      spacerDisabledAtLengthRef.current = messages.length
      disableTailSpacerRef.current = true
      spacerHeightRef.current = 0
      setDisableTailSpacer(true)
      setBottomSpacerHeight(0)
    }

    return () => {
      onUserScrollUpIntentRef.current = null
    }
  }, [cancelScheduledLayoutPass, chatUuid, getLatestMessageMetrics, messages.length, isRunStreaming, scrollParentRef])

  const handleJumpToLatestClick = useCallback(() => {
    const lastAssistantMessage = renderedLatestAssistant
    const isLatest = Boolean(lastMessageIndex === displayMessages.length - 1)
    const typewriterCompleted = Boolean(lastAssistantMessage?.body?.typewriterCompleted)
    const segments = lastAssistantMessage?.body?.segments ?? []
    const hasSegments = Array.isArray(segments) && segments.length > 0
    const shouldSkipTypewriter =
      !lastAssistantMessage ||
      typewriterCompleted ||
      !isLatest ||
      !hasSegments

    if (!isRunStreaming && lastAssistantMessage && !shouldSkipTypewriter) {
      const updatedMessage: MessageEntity = {
        ...lastAssistantMessage,
        body: {
          ...lastAssistantMessage.body,
          typewriterCompleted: true
        }
      }
      upsertMessage(updatedMessage)
      if (updatedMessage.id) {
        void patchMessageUiState(updatedMessage.id, { typewriterCompleted: true })
      }
    }
    spacerDisabledAtLengthRef.current = messages.length
    disableTailSpacerRef.current = true
    spacerHeightRef.current = 0
    setDisableTailSpacer(true)
    lockedAnchorMessageIdRef.current = null
    hasInitialAnchorScrollDoneRef.current = true
    scrollModeRef.current = 'tail-follow'
    cancelScheduledLayoutPass()
    // Button targets the latest message (confirmed behavior).
    scrollToMessageIndex(latestMessageIndex, true, 'end')
  }, [cancelScheduledLayoutPass, renderedLatestAssistant, displayMessages.length, latestMessageIndex, isRunStreaming, scrollToMessageIndex, patchMessageUiState, upsertMessage, lastMessageIndex, messages.length])

  

  // Detect first message - trigger exit animation then hide welcome
  useLayoutEffect(() => {
    if (messages.length > 0 && showWelcome && !hasShownWelcomeRef.current) {
      hasShownWelcomeRef.current = true
      // Start exit animation immediately
      setIsWelcomeExiting(true)
      // Wait for animation to complete before removing from DOM
      setTimeout(() => {
        setShowWelcome(false)
        setIsWelcomeExiting(false)
      }, 260) // Match animation duration
    }
  }, [messages.length, showWelcome])

  // Reset welcome page on chat switch
  useEffect(() => {
    if (messages.length === 0) {
      setShowWelcome(true)
      setIsWelcomeExiting(false)
      hasShownWelcomeRef.current = false
    }
  }, [chatUuid, messages.length])

  useEffect(() => {
    cancelScheduledLayoutPass()

    spacerDisabledAtLengthRef.current = 0
    disableTailSpacerRef.current = false
    scrollModeRef.current = 'tail-follow'
    lockedAnchorMessageIdRef.current = null
    hasInitialAnchorScrollDoneRef.current = true
    latestVisibleRef.current = true
    spacerHeightRef.current = 0
    setDisableTailSpacer(false)
    setBottomSpacerHeight(0)
  }, [cancelScheduledLayoutPass, chatUuid])

  useEffect(() => {
    if (!disableTailSpacer) return
    if (messages.length > spacerDisabledAtLengthRef.current) {
      disableTailSpacerRef.current = false
      setDisableTailSpacer(false)
    }
  }, [disableTailSpacer, messages.length])

  useEffect(() => {
    disableTailSpacerRef.current = disableTailSpacer
  }, [disableTailSpacer])

  useEffect(() => {
    spacerHeightRef.current = bottomSpacerHeight
  }, [bottomSpacerHeight])

  useLayoutEffect(() => {
    requestLayoutPass('transcript-change')
  }, [
    autoTopAnchorIndex,
    latestAssistantNonTextSignature,
    latestAssistantTextSignature,
    latestMessageIndex,
    messages.length,
    bottomSpacerHeight,
    isRunStreaming,
    requestLayoutPass
  ])

  useEffect(() => {
    const container = scrollParentRef.current
    if (!container) return

    requestLayoutPass('container-mounted')
    const containerObserver = new ResizeObserver(() => {
      requestLayoutPass('container-resize')
    })
    containerObserver.observe(container)

    return () => {
      containerObserver.disconnect()
    }
  }, [artifactsPanelOpen, requestLayoutPass, scrollParentRef])

  useEffect(() => {
    return () => {
      cancelScheduledLayoutPass()
      if (suppressScrollIntentReleaseRafRef.current) {
        cancelAnimationFrame(suppressScrollIntentReleaseRafRef.current)
        suppressScrollIntentReleaseRafRef.current = 0
      }
      suppressScrollIntentRef.current = false
    }
  }, [cancelScheduledLayoutPass])

  const handleLatestAssistantTyping = useCallback(() => {
    if (scrollModeRef.current !== 'anchor-lock') {
      return
    }
    requestLayoutPass('typing-change')
  }, [requestLayoutPass])

  return (
    <div className="min-h-svh max-h-svh overflow-hidden flex flex-col app-undragable bg-chat-light dark:bg-chat-dark">
      <ChatHeaderComponent />

      {/* 外层垂直分割容器 */}
      <ResizablePanelGroup
        direction="vertical"
        className="grow mt-12 overflow-hidden"
        id="vertical-panel-group"
      >
        {/* ========== 上部面板：包含聊天和 Artifacts ========== */}
        <ResizablePanel
          id="main-content-panel"
          defaultSize={75}
          minSize={30}
          maxSize={85}
          className="flex flex-col overflow-hidden"
        >
          {/* 内层水平分割容器 */}
          <ResizablePanelGroup
            direction="horizontal"
            className="flex-1 overflow-hidden"
            id="horizontal-panel-group"
          >
            {/* 左侧：聊天区域 */}
            <ResizablePanel
              defaultSize={artifactsPanelOpen ? 60 : 100}
              minSize={30}
              className="flex flex-col overflow-hidden relative"
              id="chat-panel"
            >
              <AnimatePresence initial={false}>
                {displayPlans.length > 0 && (
                  <motion.div
                    className="shrink-0 px-2 pt-1 pb-1 bg-chat-light/95 dark:bg-chat-dark/95 backdrop-blur-sm overflow-hidden"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                  >
                    <div className="space-y-2">
                      {displayPlans.map((plan, index) => {
                        const isPendingReview = pendingPlanReview?.plan.id === plan.id
                        return (
                        <motion.div
                          key={plan.id}
                          initial={{ opacity: 0, y: -30 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            duration: 0.3,
                            ease: [0.25, 0.46, 0.45, 0.94],
                            delay: index * 0.05
                          }}
                        >
                          <TaskPlanBar
                            plan={plan}
                            onPlanUpdated={refreshPlans}
                            onApprove={isPendingReview ? approvePlanReview : undefined}
                            onAbort={isPendingReview ? abortPlanReview : undefined}
                          />
                        </motion.div>
                        )
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div
                ref={scrollParentRef}
                className="min-h-0 flex-1 app-undragable overflow-scroll px-2 contain-layout contain-paint overscroll-contain"
                style={{ overflowAnchor: 'none' }}
              >
              <Virtuoso
                key={chatUuid ?? 'empty-chat'}
                ref={virtuosoRef}
                data={displayMessages}
                className="h-full w-full"
                customScrollParent={scrollParentRef.current ?? undefined}
                totalListHeightChanged={() => {
                  requestLayoutPass('total-list-height-changed')
                }}
                components={{
                  Footer: () => <div style={{ height: bottomSpacerHeight }} />
                }}
                overscan={150}
                increaseViewportBy={{ top: 200, bottom: 400 }}
                rangeChanged={onRangeChanged}
                itemContent={(index, message) => (
                  <div
                    data-index={index}
                    data-message-id={message.id ?? undefined}
                    className="w-full min-h-px"
                  >
                    <ChatMessageRow
                      messageIndex={index}
                      message={message}
                      previewMessage={
                        previewMessage && previewRenderIndex === index && !previewStandalone
                          ? previewMessage.body
                          : undefined
                      }
                      lastAssistantIndex={lastAssistantIndex}
                      lastMessageIndex={lastMessageIndex}
                      onTypingChange={handleLatestAssistantTyping}
                    />
                  </div>
                )}
              />
              </div>

              {showWelcome && (
                <div
                  className={cn(
                    "welcome-overlay",
                    isWelcomeExiting && "welcome-overlay-exit"
                  )}
                >
                  <WelcomeMessage isExiting={isWelcomeExiting} />
                </div>
              )}

              {/* 定位最新消息按钮 - 绝对定位在 ChatPanel 底部中间 */}
              {showJumpToLatest && (
                <div
                  id="jumpToLatest"
                  onClick={handleJumpToLatestClick}
                  className={cn(
                    "absolute bottom-1 left-1/2 -translate-x-1/2 bg-black/5 backdrop-blur-xl cursor-pointer rounded-full shadow-lg border-white/5 border z-50",
                    "transition-all duration-300 ease-out hover:scale-110",
                    isButtonFadingOut
                      ? "opacity-0 translate-y-5 scale-75"
                      : "opacity-100 translate-y-0"
                  )}
                >
                  <ArrowDown className="text-gray-400 p-1 m-1" />
                </div>
              )}
            </ResizablePanel>

            {/* 右侧：Artifacts 面板 */}
            {artifactsPanelOpen && (
              <>
                <ResizableHandle
                  className="hover:bg-primary/10 active:bg-primary/20 bg-transparent transition-colors duration-200 mt-2 mb-2 [&>div]:hidden [&::before]:hidden"
                />
                <ResizablePanel
                  defaultSize={40}
                  minSize={25}
                  maxSize={70}
                  collapsible={true}
                  collapsedSize={0}
                  onResize={(size) => {
                    if (size === 0 && artifactsPanelOpen) {
                      setArtifactsPanel(false)
                    }
                  }}
                  className="bg-transparent overflow-hidden"
                  id="artifacts-panel"
                >
                  <div className="h-full w-full overflow-hidden">
                    <ArtifactsPanel />
                  </div>
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        </ResizablePanel>

        <ResizableHandle className="hover:bg-primary/10 active:bg-primary/20 bg-transparent transition-colors duration-200 [&>div]:hidden [&::before]:hidden" />

        <ResizablePanel
          id="input-panel"
          defaultSize={25}
          minSize={10}
          maxSize={70}
          className="bg-transparent overflow-hidden relative"
        >
          <div ref={inputAreaRef} className="h-full overflow-hidden">
            <ChatInputArea />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      <FloatingArtifactsToggle />
    </div>
  )
}

export default ChatWindowComponentNext

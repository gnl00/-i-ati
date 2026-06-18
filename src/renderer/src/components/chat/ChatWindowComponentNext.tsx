import { ArtifactsPanel, FloatingArtifactsToggle } from '@renderer/components/artifacts'
import ChatHeaderComponent from "@renderer/components/chat/ChatHeaderComponent"
import ChatInputArea, { type ChatInputAreaHandle } from "@renderer/components/chat/chatInput/ChatInputArea"
import ChatMessageComponent from "@renderer/components/chat/chatMessage/ChatMessageComponent"
import WelcomeMessage from "@renderer/components/chat/welcome/SmartWelcomeEntranceV2"
import { useScrollManagerTop, type UserScrollSource } from '@renderer/hooks/useScrollManagerTop'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@renderer/components/ui/resizable'
import { cn } from '@renderer/lib/utils'
import { useChatStore } from '@renderer/store/chatStore'
import { useAppConfigStore } from '@renderer/store/appConfig'
import { useVirtualizer, type VirtualItem, type Virtualizer } from '@tanstack/react-virtual'
import { ArrowDown } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { TaskPlanBar } from './task/TaskPlanBar'
import { useTaskPlan } from '@renderer/hooks/useTaskPlan'
import { useSubagentRuntime } from '@renderer/hooks/useSubagentRuntime'
import { useToolConfirmations } from '@renderer/hooks/useToolConfirmations'
import { useScheduleNotifications } from '@renderer/hooks/useScheduleNotifications'

const STREAMING_FOLLOW_RESTORE_THRESHOLD_PX = 24
const CHAT_HEADER_OCCLUSION_PX = 48
const CHAT_HEADER_OCCLUSION_PADDING_STYLE: React.CSSProperties = {
  paddingTop: CHAT_HEADER_OCCLUSION_PX
}
const CHAT_HEADER_OCCLUSION_HANDLE_STYLE: React.CSSProperties = {
  marginTop: CHAT_HEADER_OCCLUSION_PX,
  marginBottom: 8
}
const PENDING_USER_MESSAGE_ID = -1
const CHAT_SCROLL_END_THRESHOLD_PX = 80
const CHAT_VIRTUAL_OVERSCAN = 8
const CHAT_ITEM_DEFAULT_ESTIMATE_PX = 160
const CHAT_ITEM_PENDING_ASSISTANT_ESTIMATE_PX = 96
const CHAT_ITEM_USER_ESTIMATE_PX = 180
const CHAT_ITEM_ASSISTANT_ESTIMATE_PX = 220

type ScrollMode = 'tail-follow' | 'manual'

type PendingAssistantModel = {
  model?: string
  modelRef?: ModelRef
}

type ChatVirtualizer = Virtualizer<HTMLDivElement, HTMLDivElement>

type ChatVirtualListItem =
  | {
      type: 'message'
      key: string
      message: MessageEntity
      messageIndex: number
    }
  | {
      type: 'pending-assistant'
      key: string
      messageIndex: number
    }

const getMessageVirtualKey = (
  message: MessageEntity,
  index: number,
  chatUuid?: string
) => {
  if (message.id !== undefined && message.id !== null) {
    return `message:${message.id}`
  }

  return `message:${chatUuid ?? 'pending'}:${index}`
}

const getMessageTextLength = (content: ChatMessage['content']) => {
  if (typeof content === 'string') {
    return content.length
  }

  return content.reduce((total, item) => total + (item.text?.length ?? 0), 0)
}

const estimateChatItemSize = (item: ChatVirtualListItem | undefined) => {
  if (!item) {
    return CHAT_ITEM_DEFAULT_ESTIMATE_PX
  }

  if (item.type === 'pending-assistant') {
    return CHAT_ITEM_PENDING_ASSISTANT_ESTIMATE_PX
  }

  const { body } = item.message
  if (body.role === 'user') {
    const textLength = getMessageTextLength(body.content)
    if (textLength > 1600) return 240
    if (textLength > 600) return 210
    return CHAT_ITEM_USER_ESTIMATE_PX
  }

  const textLength = getMessageTextLength(body.content)
  const segmentCount = body.segments?.length ?? 0
  return Math.min(560, CHAT_ITEM_ASSISTANT_ESTIMATE_PX + Math.floor(textLength / 18) + segmentCount * 24)
}

const ChatMessageRow: React.FC<{
  messageIndex: number
  message: MessageEntity
  previewMessage?: ChatMessage
  lastAssistantIndex: number
  lastMessageIndex: number
  isPending?: boolean
  onTypingChange?: () => void
}> = memo(({ messageIndex, message, previewMessage, lastAssistantIndex, lastMessageIndex, isPending = false, onTypingChange }) => {
  const isLatest = message.body.role === 'assistant'
    ? messageIndex === lastAssistantIndex
    : messageIndex === lastMessageIndex

  return (
    <ChatMessageComponent
      message={message.body}
      tokenUsage={message.tokenUsage}
      previewMessage={previewMessage}
      index={messageIndex}
      isLatest={isLatest}
      isPending={isPending}
      onTypingChange={onTypingChange}
    />
  )
})

const ChatPendingAssistantRow: React.FC<{
  messageIndex: number
  pendingAssistantModel: PendingAssistantModel
  previewMessage?: ChatMessage
  onTypingChange?: () => void
}> = memo(({ messageIndex, pendingAssistantModel, previewMessage, onTypingChange }) => (
  <ChatMessageComponent
    index={messageIndex}
    pendingAssistantModel={pendingAssistantModel}
    previewMessage={previewMessage}
    isLatest
    onTypingChange={onTypingChange}
  />
))

const ChatWindowComponentNext: React.FC = () => {
  const messages = useChatStore(state => state.messages)
  const previewMessage = useChatStore(state => state.preview.message)
  const pendingUserMessage = useChatStore(state => state.pendingUserMessage)
  const artifactsPanelOpen = useChatStore(state => state.artifactsPanelOpen)
  const setArtifactsPanel = useChatStore(state => state.setArtifactsPanel)
  const chatUuid = useChatStore(state => state.currentChatUuid ?? undefined)
  const runPhase = useChatStore(state => state.runPhase)
  const selectedModelRef = useChatStore(state => state.selectedModelRef)
  const scrollHint = useChatStore(state => state.scrollHint)
  const clearScrollHint = useChatStore(state => state.clearScrollHint)
  const patchMessageUiState = useChatStore(state => state.patchMessageUiState)
  const upsertMessage = useChatStore(state => state.upsertMessage)
  const onUserScrollIntentRef = useRef<((source: UserScrollSource) => void) | null>(null)
  const onUserScrollUpIntentRef = useRef<((source: UserScrollSource) => void) | null>(null)
  const resolveModelRef = useAppConfigStore(state => state.resolveModelRef)
  const providersRevision = useAppConfigStore(state => state.providersRevision)
  const selectedModel = useMemo(
    () => resolveModelRef(selectedModelRef),
    [providersRevision, resolveModelRef, selectedModelRef]
  )
  const committedLastAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].body.role === 'assistant') {
        return i
      }
    }
    return -1
  }, [messages])
  const latestUserIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].body.role === 'user') {
        return i
      }
    }
    return -1
  }, [messages])
  const hasCurrentTurnAssistant = latestUserIndex >= 0
    ? committedLastAssistantIndex > latestUserIndex
    : committedLastAssistantIndex >= 0
  const isAssistantResponseActive = runPhase === 'submitting' || runPhase === 'streaming'
  const shouldRenderPendingAssistant = latestUserIndex >= 0
    && !hasCurrentTurnAssistant
    && (isAssistantResponseActive || Boolean(previewMessage))
  const pendingAssistantModel = useMemo(() => ({
    model: selectedModel?.model.label ?? selectedModelRef?.modelId,
    modelRef: selectedModelRef
      ? {
          accountId: selectedModelRef.accountId,
          modelId: selectedModelRef.modelId
        }
      : undefined
  }), [
    selectedModel?.model.label,
    selectedModelRef
  ])
  const previewRenderIndex = previewMessage
    ? (hasCurrentTurnAssistant ? committedLastAssistantIndex : -1)
    : -1
  const pendingUserMessageEntity = useMemo<MessageEntity | null>(() => {
    if (!pendingUserMessage) return null
    if (messages.length > 0) return null
    if (pendingUserMessage.chatUuid !== (chatUuid ?? null)) return null

    const mediaUrls: string[] = []
    for (const item of pendingUserMessage.mediaCtx) {
      if (typeof item === 'string' && item.length > 0) {
        mediaUrls.push(item)
      }
    }

    const mediaContent = mediaUrls.map((url): VLMContent => ({
      type: 'image_url',
      image_url: {
        url,
        detail: 'auto'
      }
    }))

    const content: ChatMessage['content'] = mediaContent.length > 0
      ? [
          {
            type: 'text',
            text: pendingUserMessage.text
          },
          ...mediaContent
        ]
      : pendingUserMessage.text

    return {
      id: PENDING_USER_MESSAGE_ID,
      chatId: undefined,
      chatUuid,
      body: {
        role: 'user',
        content,
        segments: [],
        createdAt: pendingUserMessage.createdAt
      }
    }
  }, [chatUuid, messages.length, pendingUserMessage])
  const displayMessages = useMemo(
    () => pendingUserMessageEntity ? [pendingUserMessageEntity] : messages,
    [messages, pendingUserMessageEntity]
  )
  const lastAssistantIndex = shouldRenderPendingAssistant
    ? displayMessages.length
    : previewRenderIndex >= 0
      ? previewRenderIndex
      : committedLastAssistantIndex

  const isRunStreaming = runPhase === 'streaming'
  const topOverlayRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<ChatInputAreaHandle>(null)
  const latestVisibleRef = useRef<boolean>(true)
  const scrollModeRef = useRef<ScrollMode>('tail-follow')
  const suppressScrollIntentRef = useRef<boolean>(false)
  const suppressScrollIntentReleaseRafRef = useRef<number>(0)
  const userBrowsingHistoryRef = useRef<boolean>(false)
  const chatVirtualizerRef = useRef<ChatVirtualizer | null>(null)
  const initialScrollChatKeyRef = useRef<string | null>(null)
  const { activePlans, pendingPlanReview, approvePlanReview, abortPlanReview, refreshPlans } = useTaskPlan(chatUuid)
  useToolConfirmations(chatUuid)
  useSubagentRuntime(chatUuid)
  useScheduleNotifications(chatUuid)
  const displayPlans = pendingPlanReview
    ? [pendingPlanReview.plan, ...activePlans]
    : activePlans
  const [topOverlayHeight, setTopOverlayHeight] = useState<number>(CHAT_HEADER_OCCLUSION_PX)
  const topOcclusionPx = displayPlans.length > 0 ? topOverlayHeight : CHAT_HEADER_OCCLUSION_PX
  const virtualListItems = useMemo<ChatVirtualListItem[]>(() => {
    const items: ChatVirtualListItem[] = displayMessages.map((message, index) => ({
      type: 'message',
      key: getMessageVirtualKey(message, index, chatUuid),
      message,
      messageIndex: index
    }))

    if (shouldRenderPendingAssistant) {
      items.push({
        type: 'pending-assistant',
        key: `pending-assistant:${chatUuid ?? 'empty'}`,
        messageIndex: displayMessages.length
      })
    }

    return items
  }, [chatUuid, displayMessages, shouldRenderPendingAssistant])
  const {
    scrollParentRef,
    showJumpToLatest,
    isButtonFadingOut,
    scrollToMessageIndex,
    onVirtualizerChange
  } = useScrollManagerTop({
    messagesLength: virtualListItems.length,
    chatUuid,
    virtualizerRef: chatVirtualizerRef,
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
        userBrowsingHistoryRef.current = false
      }
      latestVisibleRef.current = visible
    }
  })

  const lastMessageIndex = displayMessages.length - 1
  const latestVirtualIndex = virtualListItems.length - 1

  // Welcome page state
  const [showWelcome, setShowWelcome] = useState<boolean>(true)
  const [isWelcomeExiting, setIsWelcomeExiting] = useState<boolean>(false)
  const [isWelcomeComposerFocused, setIsWelcomeComposerFocused] = useState<boolean>(false)
  const hasShownWelcomeRef = useRef<boolean>(false)

  const handleWelcomeSuggestionClick = useCallback((prompt: string) => {
    chatInputRef.current?.fillInput(prompt)
  }, [])
  const renderedLatestAssistant = useMemo(() => {
    if (shouldRenderPendingAssistant) {
      return previewMessage ?? undefined
    }
    if (lastAssistantIndex < 0) return undefined
    if (previewMessage && previewRenderIndex === lastAssistantIndex) {
      return previewMessage
    }
    return displayMessages[lastAssistantIndex]
  }, [displayMessages, lastAssistantIndex, previewRenderIndex, previewMessage, shouldRenderPendingAssistant])

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

  const markManualBrowsing = useCallback(() => {
    userBrowsingHistoryRef.current = true
    scrollModeRef.current = 'manual'
  }, [])

  const getVirtualItemKey = useCallback((index: number) => {
    return virtualListItems[index]?.key ?? `missing:${index}`
  }, [virtualListItems])

  const measureChatElement = useCallback((element: HTMLDivElement) => {
    return Math.ceil(element.getBoundingClientRect().height)
  }, [])

  const shouldAdjustScrollPositionOnItemSizeChange = useCallback((
    item: VirtualItem,
    _delta: number,
    instance: ChatVirtualizer
  ) => {
    if (scrollModeRef.current === 'tail-follow' && instance.isAtEnd(CHAT_SCROLL_END_THRESHOLD_PX)) {
      return true
    }

    const viewportStart = (instance.scrollOffset ?? 0) + topOcclusionPx
    const itemEnd = item.start + item.size
    return itemEnd <= viewportStart
  }, [topOcclusionPx])

  const chatVirtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: virtualListItems.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: (index) => estimateChatItemSize(virtualListItems[index]),
    getItemKey: getVirtualItemKey,
    measureElement: measureChatElement,
    overscan: CHAT_VIRTUAL_OVERSCAN,
    paddingStart: topOcclusionPx,
    paddingEnd: 12,
    scrollPaddingStart: topOcclusionPx,
    anchorTo: 'end',
    followOnAppend: true,
    scrollEndThreshold: CHAT_SCROLL_END_THRESHOLD_PX,
    useAnimationFrameWithResizeObserver: true,
    onChange: onVirtualizerChange
  })
  chatVirtualizer.shouldAdjustScrollPositionOnItemSizeChange = shouldAdjustScrollPositionOnItemSizeChange
  chatVirtualizerRef.current = chatVirtualizer
  const virtualRows = chatVirtualizer.getVirtualItems()

  useLayoutEffect(() => {
    if (virtualListItems.length <= 0) return
    if (scrollHint.type !== 'none' && scrollHint.chatUuid === (chatUuid ?? null)) return

    const chatKey = chatUuid ?? 'empty-chat'
    if (initialScrollChatKeyRef.current === chatKey) return

    initialScrollChatKeyRef.current = chatKey
    userBrowsingHistoryRef.current = false
    scrollModeRef.current = 'tail-follow'
    requestAnimationFrame(() => {
      suppressUserScrollIntent(3)
      chatVirtualizerRef.current?.scrollToEnd({ behavior: 'auto' })
    })
  }, [chatUuid, scrollHint, suppressUserScrollIntent, virtualListItems.length])

  useLayoutEffect(() => {
    if (scrollHint.type !== 'conversation-switch') return
    if (scrollHint.chatUuid !== (chatUuid ?? null)) return
    if (virtualListItems.length <= 0) {
      clearScrollHint()
      return
    }

    const chatKey = chatUuid ?? 'empty-chat'
    initialScrollChatKeyRef.current = chatKey
    const targetIndex = Math.min(scrollHint.index, Math.max(virtualListItems.length - 1, 0))
    userBrowsingHistoryRef.current = false
    scrollModeRef.current = 'tail-follow'
    clearScrollHint()
    requestAnimationFrame(() => {
      suppressUserScrollIntent(3)
      scrollToMessageIndex(targetIndex, false, scrollHint.align)
    })
  }, [
    chatUuid,
    clearScrollHint,
    scrollToMessageIndex,
    scrollHint,
    suppressUserScrollIntent,
    virtualListItems.length
  ])

  useLayoutEffect(() => {
    if (scrollHint.type !== 'user-sent') return
    if (scrollHint.chatUuid !== (chatUuid ?? null)) return
    if (virtualListItems.length <= 0) return

    const anchorIndex = scrollHint.messageId !== undefined
      ? virtualListItems.findIndex(item => item.type === 'message' && item.message.id === scrollHint.messageId)
      : latestVirtualIndex
    const resolvedTargetIndex = scrollHint.messageId !== undefined
      ? anchorIndex
      : latestVirtualIndex
    if (scrollHint.messageId !== undefined && anchorIndex < 0) {
      return
    }
    if (resolvedTargetIndex < 0) return

    const chatKey = chatUuid ?? 'empty-chat'
    initialScrollChatKeyRef.current = chatKey
    userBrowsingHistoryRef.current = false
    scrollModeRef.current = 'tail-follow'
    clearScrollHint()
    requestAnimationFrame(() => {
      suppressUserScrollIntent(3)
      scrollToMessageIndex(latestVirtualIndex, false, 'end')
    })
  }, [
    chatUuid,
    clearScrollHint,
    latestVirtualIndex,
    scrollHint,
    scrollToMessageIndex,
    suppressUserScrollIntent,
    virtualListItems
  ])

  useLayoutEffect(() => {
    if (scrollHint.type !== 'search-result') return
    if (scrollHint.chatUuid !== (chatUuid ?? null)) return

    const targetIndex = virtualListItems.findIndex(item => item.type === 'message' && item.message.id === scrollHint.messageId)
    if (targetIndex < 0) {
      return
    }

    const chatKey = chatUuid ?? 'empty-chat'
    initialScrollChatKeyRef.current = chatKey
    markManualBrowsing()
    clearScrollHint()
    requestAnimationFrame(() => {
      suppressUserScrollIntent(3)
      scrollToMessageIndex(targetIndex, false, 'start')
    })
  }, [
    chatUuid,
    clearScrollHint,
    markManualBrowsing,
    scrollHint,
    scrollToMessageIndex,
    suppressUserScrollIntent,
    virtualListItems
  ])

  useEffect(() => {
    onUserScrollIntentRef.current = () => {
      const virtualizer = chatVirtualizerRef.current
      if (virtualizer?.isAtEnd(STREAMING_FOLLOW_RESTORE_THRESHOLD_PX)) {
        scrollModeRef.current = 'tail-follow'
        userBrowsingHistoryRef.current = false
        return
      }

      markManualBrowsing()
    }

    return () => {
      onUserScrollIntentRef.current = null
    }
  }, [markManualBrowsing])

  useEffect(() => {
    onUserScrollUpIntentRef.current = () => {
      markManualBrowsing()
    }

    return () => {
      onUserScrollUpIntentRef.current = null
    }
  }, [markManualBrowsing])

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
    userBrowsingHistoryRef.current = false
    scrollModeRef.current = 'tail-follow'
    // Button targets the latest message (confirmed behavior).
    scrollToMessageIndex(latestVirtualIndex, true, 'end')
  }, [renderedLatestAssistant, displayMessages.length, latestVirtualIndex, isRunStreaming, scrollToMessageIndex, patchMessageUiState, upsertMessage, lastMessageIndex])

  

  // Detect first message - trigger exit animation then hide welcome
  const hasVisibleTranscript = displayMessages.length > 0
  const isWelcomeMode = showWelcome && !hasVisibleTranscript
  const shouldRenderWelcomeStage = showWelcome && (
    isWelcomeMode
    || isWelcomeExiting
    || !hasShownWelcomeRef.current
  )

  useLayoutEffect(() => {
    if (hasVisibleTranscript && showWelcome && !hasShownWelcomeRef.current) {
      hasShownWelcomeRef.current = true
      setIsWelcomeComposerFocused(false)
      // Start exit animation immediately
      setIsWelcomeExiting(true)
      // Wait for animation to complete before removing from DOM
      setTimeout(() => {
        setShowWelcome(false)
        setIsWelcomeExiting(false)
      }, 220) // Match animation duration
    }
  }, [hasVisibleTranscript, showWelcome])

  // Reset welcome page on chat switch
  useEffect(() => {
    if (!hasVisibleTranscript) {
      setShowWelcome(true)
      setIsWelcomeExiting(false)
      setIsWelcomeComposerFocused(false)
      hasShownWelcomeRef.current = false
    }
  }, [chatUuid, hasVisibleTranscript])

  useEffect(() => {
    initialScrollChatKeyRef.current = null
    scrollModeRef.current = 'tail-follow'
    latestVisibleRef.current = true
    userBrowsingHistoryRef.current = false
  }, [chatUuid])

  useLayoutEffect(() => {
    if (displayPlans.length === 0) {
      setTopOverlayHeight(CHAT_HEADER_OCCLUSION_PX)
      return
    }

    const overlay = topOverlayRef.current
    if (!overlay) return

    const measureOverlay = () => {
      const nextHeight = Math.max(
        CHAT_HEADER_OCCLUSION_PX,
        Math.ceil(overlay.getBoundingClientRect().height)
      )
      setTopOverlayHeight(currentHeight => (
        currentHeight === nextHeight ? currentHeight : nextHeight
      ))
    }

    measureOverlay()
    const overlayObserver = new ResizeObserver(measureOverlay)
    overlayObserver.observe(overlay)

    return () => {
      overlayObserver.disconnect()
    }
  }, [displayPlans.length])

  useEffect(() => {
    return () => {
      if (suppressScrollIntentReleaseRafRef.current) {
        cancelAnimationFrame(suppressScrollIntentReleaseRafRef.current)
        suppressScrollIntentReleaseRafRef.current = 0
      }
      suppressScrollIntentRef.current = false
    }
  }, [])

  const handleLatestAssistantTyping = useCallback(() => {
    if (scrollModeRef.current !== 'tail-follow') {
      return
    }
    requestAnimationFrame(() => {
      if (scrollModeRef.current !== 'tail-follow') return
      chatVirtualizerRef.current?.scrollToEnd({ behavior: 'auto' })
    })
  }, [])

  return (
    <>
      <ChatHeaderComponent />

      <div className="relative z-0 -mt-11 min-h-svh max-h-svh overflow-hidden flex flex-col bg-chat-light dark:bg-chat-dark">
        {shouldRenderWelcomeStage ? (
          <div
            className={cn(
              "welcome-stage",
              isWelcomeComposerFocused && "welcome-stage-composer-focused",
              isWelcomeExiting && "welcome-stage-exit"
            )}
          >
            <WelcomeMessage
              isExiting={isWelcomeExiting}
              isComposerFocused={isWelcomeComposerFocused}
              onSuggestionClick={handleWelcomeSuggestionClick}
              composer={(
                <ChatInputArea
                  ref={chatInputRef}
                  welcomeVisualMode
                  onWelcomeFocusStateChange={setIsWelcomeComposerFocused}
                />
              )}
            />
          </div>
        ) : (
          <ResizablePanelGroup
            direction="vertical"
            className="grow overflow-hidden"
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
                  <div className="pointer-events-none absolute inset-x-0 top-0 z-40 overflow-hidden">
                    <AnimatePresence initial={false}>
                      {displayPlans.length > 0 && (
                        <motion.div
                          ref={topOverlayRef}
                          className={cn(
                            'pointer-events-none relative px-2 pb-2',
                            'bg-chat-light/72 backdrop-blur-xl',
                            'dark:bg-chat-dark/72',
                            'after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-white/45',
                            'dark:after:bg-white/10'
                          )}
                          style={CHAT_HEADER_OCCLUSION_PADDING_STYLE}
                          initial={{ y: -12, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          exit={{ y: -12, opacity: 0 }}
                          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                        >
                          <div className="pointer-events-auto space-y-2">
                            {displayPlans.map((plan, index) => {
                              const isPendingReview = pendingPlanReview?.plan.id === plan.id
                              return (
                                <motion.div
                                  key={plan.id}
                                  initial={{ opacity: 0, y: -16 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{
                                    duration: 0.24,
                                    ease: [0.22, 1, 0.36, 1],
                                    delay: index * 0.04
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
                  </div>

                  <div
                    ref={scrollParentRef}
                    className="min-h-0 flex-1 overflow-auto px-2 contain-layout contain-paint overscroll-contain"
                    style={{ overflowAnchor: 'none' }}
                  >
                    <div
                      className="relative w-full"
                      style={{ height: chatVirtualizer.getTotalSize() }}
                    >
                      {virtualRows.map((virtualRow) => {
                        const item = virtualListItems[virtualRow.index]
                        if (!item) return null

                        const message = item.type === 'message' ? item.message : null
                        return (
                        <div
                          key={virtualRow.key}
                          ref={chatVirtualizer.measureElement}
                          data-index={item.messageIndex}
                          data-message-id={message?.id ?? undefined}
                          data-message-role={message?.body.role ?? 'assistant'}
                          className="w-full min-h-px"
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            transform: `translateY(${virtualRow.start}px)`
                          }}
                        >
                          {item.type === 'message' ? (
                            <ChatMessageRow
                              messageIndex={item.messageIndex}
                              message={item.message}
                              previewMessage={
                                previewMessage && previewRenderIndex === item.messageIndex
                                  ? previewMessage.body
                                  : undefined
                              }
                              lastAssistantIndex={lastAssistantIndex}
                              lastMessageIndex={lastMessageIndex}
                              isPending={item.message.id === PENDING_USER_MESSAGE_ID}
                              onTypingChange={handleLatestAssistantTyping}
                            />
                          ) : (
                            <ChatPendingAssistantRow
                              messageIndex={item.messageIndex}
                              pendingAssistantModel={pendingAssistantModel}
                              previewMessage={!hasCurrentTurnAssistant ? previewMessage?.body : undefined}
                              onTypingChange={handleLatestAssistantTyping}
                            />
                          )}
                        </div>
                        )
                      })}
                    </div>
                  </div>

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
                      className="hover:bg-primary/10 active:bg-primary/20 bg-transparent transition-colors duration-200 [&>div]:hidden [&::before]:hidden"
                      style={CHAT_HEADER_OCCLUSION_HANDLE_STYLE}
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
                      <div
                        className="h-full w-full overflow-hidden"
                        style={CHAT_HEADER_OCCLUSION_PADDING_STYLE}
                      >
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
              className="bg-transparent relative"
            >
              <div className="h-full overflow-hidden">
                <ChatInputArea ref={chatInputRef} />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}

        <FloatingArtifactsToggle />
      </div>
    </>
  )
}

export default ChatWindowComponentNext

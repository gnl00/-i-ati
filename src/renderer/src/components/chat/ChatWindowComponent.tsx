import { ArtifactsPanel } from '@renderer/components/artifacts'
import ChatHeaderComponent from "@renderer/components/chat/ChatHeaderComponent"
import ChatInputArea from "@renderer/components/chat/chatInput/ChatInputArea"
import ChatMessageComponent from "@renderer/components/chat/chatMessage/ChatMessageComponent"
import WelcomeMessage from "@renderer/components/chat/welcome/WelcomeMessageNext2"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@renderer/components/ui/resizable'
import { cn } from '@renderer/lib/utils'
import { useChatStore } from '@renderer/store'
import { ArrowDown } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import React, { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Virtuoso } from 'react-virtuoso'
import { useScrollManagerLite } from '@renderer/hooks/useScrollManagerLite'
import { TaskPlanCard } from './task/TaskPlanCard'
import { useTaskPlan } from '@renderer/hooks/useTaskPlan'
import { useToolConfirmations } from '@renderer/hooks/useToolConfirmations'
import { useScheduleNotifications } from '@renderer/hooks/useScheduleNotifications'

const ChatMessageRow: React.FC<{
  messageIndex: number
  message: MessageEntity
  lastAssistantIndex: number
  lastMessageIndex: number
  onTyping: () => void
}> = memo(({ messageIndex, message, lastAssistantIndex, lastMessageIndex, onTyping }) => {
  const isLatest = message.body.role === 'assistant'
    ? messageIndex === lastAssistantIndex
    : messageIndex === lastMessageIndex

  return (
    <ChatMessageComponent
      message={message.body}
      index={messageIndex}
      isLatest={isLatest}
      onTypingChange={onTyping}
    />
  )
})

const ChatWindowComponent: React.FC = () => {
  const messages = useChatStore(state => state.messages)
  const lastAssistantIndex = useChatStore(state => {
    for (let i = state.messages.length - 1; i >= 0; i--) {
      if (state.messages[i].body.role === 'assistant') {
        return i
      }
    }
    return -1
  })
  const artifactsPanelOpen = useChatStore(state => state.artifactsPanelOpen)
  const setArtifactsPanel = useChatStore(state => state.setArtifactsPanel)
  const chatUuid = useChatStore(state => state.currentChatUuid ?? undefined)
  const readStreamState = useChatStore(state => state.readStreamState)
  const updateMessage = useChatStore(state => state.updateMessage)
  const upsertMessage = useChatStore(state => state.upsertMessage)

  const inputAreaRef = useRef<HTMLDivElement>(null)
  const {
    scrollParentRef,
    virtuosoRef,
    showScrollToBottom,
    isButtonFadingOut,
    scrollToBottom,
    onTyping,
    onMessagesUpdate,
    onAtBottomStateChange
  } = useScrollManagerLite({
    messagesLength: messages.length,
    chatUuid
  })

  const lastMessageIndex = messages.length - 1

  // Welcome page state
  const [showWelcome, setShowWelcome] = useState<boolean>(true)
  const [isWelcomeExiting, setIsWelcomeExiting] = useState<boolean>(false)
  const hasShownWelcomeRef = useRef<boolean>(false)
  const { activePlans, pendingPlanReview, approvePlanReview, abortPlanReview, refreshPlans } = useTaskPlan(chatUuid)
  useToolConfirmations(chatUuid)
  useScheduleNotifications(chatUuid)
  const displayPlans = pendingPlanReview
    ? [pendingPlanReview.plan, ...activePlans]
    : activePlans

  const handleScrollToBottomClick = useCallback(() => {
    const lastAssistantIndex = [...messages].reverse().findIndex(m => m.body?.role === 'assistant')
    const lastAssistantMessage =
      lastAssistantIndex >= 0 ? messages[messages.length - 1 - lastAssistantIndex] : undefined
    const isLatest = Boolean(lastMessageIndex === messages.length - 1)
    const typewriterCompleted = Boolean(lastAssistantMessage?.body?.typewriterCompleted)
    const segments = lastAssistantMessage?.body?.segments ?? []
    const hasSegments = Array.isArray(segments) && segments.length > 0
    const shouldSkipTypewriter =
      !lastAssistantMessage ||
      typewriterCompleted ||
      !isLatest ||
      !hasSegments

    if (!readStreamState && lastAssistantMessage && !shouldSkipTypewriter) {
      const updatedMessage: MessageEntity = {
        ...lastAssistantMessage,
        body: {
          ...lastAssistantMessage.body,
          typewriterCompleted: true
        }
      }
      upsertMessage(updatedMessage)
      if (updatedMessage.id) {
        void updateMessage(updatedMessage)
      }
    }
    scrollToBottom(true)
  }, [messages, readStreamState, scrollToBottom, updateMessage, upsertMessage, lastMessageIndex])

  

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
              <div
                ref={scrollParentRef}
                className="flex-1 app-undragable overflow-scroll px-2 contain-layout contain-paint overscroll-contain"
                style={{ overflowAnchor: 'none' }}
              >
              <AnimatePresence initial={false}>
                {displayPlans.length > 0 && (
                  <motion.div
                    className="sticky top-0 z-30 -mx-2 px-2 pt-1 pb-1 bg-chat-light/95 dark:bg-chat-dark/95 backdrop-blur-sm overflow-hidden"
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
                          <TaskPlanCard
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
              <Virtuoso
                ref={virtuosoRef}
                data={messages}
                className="h-full w-full"
                customScrollParent={scrollParentRef.current ?? undefined}
                overscan={150}
                increaseViewportBy={{ top: 200, bottom: 400 }}
                atBottomThreshold={20}
                atBottomStateChange={onAtBottomStateChange}
                itemContent={(index, message) => (
                  <div data-index={index} className="w-full min-h-px">
                    <ChatMessageRow
                      messageIndex={index}
                      message={message}
                      lastAssistantIndex={lastAssistantIndex}
                      lastMessageIndex={lastMessageIndex}
                      onTyping={onTyping}
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

              {/* ScrollToBottom 按钮 - 绝对定位在 ChatPanel 底部中间 */}
              {showScrollToBottom && (
                <div
                  id="scrollToBottom"
                  onClick={handleScrollToBottomClick}
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
            <ChatInputArea
              onMessagesUpdate={onMessagesUpdate}
            />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}

export default ChatWindowComponent

import { ArtifactsPanel } from '@renderer/components/artifacts'
import ChatHeaderComponent from "@renderer/components/chat/ChatHeaderComponent"
import ChatInputArea from "@renderer/components/chat/chatInput/ChatInputArea"
import ChatMessageComponent from "@renderer/components/chat/chatMessage/ChatMessageComponent"
import WelcomeMessage from "@renderer/components/chat/welcome/WelcomeMessageNext2"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@renderer/components/ui/resizable'
import { cn } from '@renderer/lib/utils'
import { useChatStore } from '@renderer/store'
import { useAssistantStore } from '@renderer/store/assistant'
import { ArrowDown } from 'lucide-react'
import React, { forwardRef, memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useChatScroll } from './useChatScroll'

const PAGE_SIZE = 30

const ChatMessageRow: React.FC<{
  messageIndex: number
  message: MessageEntity
  lastAssistantIndex: number
  lastMessageIndex: number
  onTyping: () => void
  isReducedRender?: boolean
}> = memo(({ messageIndex, message, lastAssistantIndex, lastMessageIndex, onTyping, isReducedRender }) => {
  const isLatest = message.body.role === 'assistant'
    ? messageIndex === lastAssistantIndex
    : messageIndex === lastMessageIndex

  return (
    <ChatMessageComponent
      message={message.body}
      index={messageIndex}
      isLatest={isLatest}
      onTypingChange={onTyping}
      isReducedRender={isReducedRender}
    />
  )
})

const ChatWindowComponentV3: React.FC = forwardRef<HTMLDivElement>(() => {
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

  const inputAreaRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const chatListRef = useRef<HTMLDivElement>(null)
  const chatPaddingElRef = useRef<HTMLDivElement>(null)
  const {
    showScrollToBottom,
    isButtonFadingOut,
    scrollToBottom,
    onMessagesUpdate,
    onTyping
  } = useChatScroll({
    chatUuid,
    messageCount: messages.length,
    scrollContainerRef,
    chatListRef,
    chatPaddingElRef
  })

  // Welcome page state
  const [showWelcome, setShowWelcome] = useState<boolean>(true)
  const [isWelcomeExiting, setIsWelcomeExiting] = useState<boolean>(false)
  const hasShownWelcomeRef = useRef<boolean>(false)
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE)
  const loadingMoreRef = useRef<boolean>(false)

  // 从 Assistant Store 获取 setCurrentAssistant
  const { setCurrentAssistant } = useAssistantStore()

  // 处理 Assistant 卡片点击
  const handleAssistantClick = useCallback((assistant: Assistant) => {
    // 设置当前选中的 Assistant
    setCurrentAssistant(assistant)
    console.log('[ChatWindow] Selected assistant:', assistant.name)
  }, [setCurrentAssistant])

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
    setVisibleCount(PAGE_SIZE)
    loadingMoreRef.current = false
  }, [chatUuid, messages.length])

  const visibleStartIndex = Math.max(0, messages.length - visibleCount)
  const visibleMessages = messages.slice(visibleStartIndex)
  const lastMessageIndex = messages.length - 1

  const loadMore = useCallback(() => {
    if (loadingMoreRef.current) return
    if (visibleStartIndex === 0) return
    const container = scrollContainerRef.current
    if (!container) return
    loadingMoreRef.current = true
    const prevScrollHeight = container.scrollHeight
    setVisibleCount((count) => Math.min(messages.length, count + PAGE_SIZE))
    requestAnimationFrame(() => {
      const nextScrollHeight = container.scrollHeight
      container.scrollTop += nextScrollHeight - prevScrollHeight
      loadingMoreRef.current = false
    })
  }, [messages.length, visibleStartIndex])

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    let raf = 0
    const handleScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        if (container.scrollTop <= 20) {
          loadMore()
        }
      })
    }
    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', handleScroll)
      if (raf) {
        cancelAnimationFrame(raf)
      }
    }
  }, [loadMore])

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
              <div ref={scrollContainerRef} className="flex-1 app-undragable overflow-scroll px-2">
                <div
                  ref={chatListRef}
                  id='chat-list'
                  className="relative w-full contain-layout contain-paint"
                >
                  {visibleStartIndex > 0 && (
                    <div className="w-full flex items-center justify-center py-3">
                      <div className="text-[11px] font-semibold tracking-wide text-slate-400 dark:text-slate-500">
                        Loading earlier messages…
                      </div>
                    </div>
                  )}
                  {visibleMessages.map((message, index) => (
                    <div
                      key={message.id ?? `msg-${visibleStartIndex + index}`}
                      data-index={visibleStartIndex + index}
                      className="w-full"
                    >
                      <ChatMessageRow
                        messageIndex={visibleStartIndex + index}
                        message={message}
                        lastAssistantIndex={lastAssistantIndex}
                        lastMessageIndex={lastMessageIndex}
                        onTyping={onTyping}
                        isReducedRender={showScrollToBottom}
                      />
                    </div>
                  ))}
                </div>
                <div id="scrollBottomEl" ref={chatPaddingElRef} className="h-px"></div>
              </div>

              {showWelcome && (
                <div
                  className={cn(
                    "welcome-overlay",
                    isWelcomeExiting && "welcome-overlay-exit"
                  )}
                >
                  <WelcomeMessage
                    onAssistantClick={handleAssistantClick}
                    isExiting={isWelcomeExiting}
                  />
                </div>
              )}

              {/* ScrollToBottom 按钮 - 绝对定位在 ChatPanel 底部中间 */}
              {showScrollToBottom && (
                <div
                  id="scrollToBottom"
                  onClick={() => scrollToBottom(true)}
                  className={cn(
                    "absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/5 backdrop-blur-xl cursor-pointer rounded-full shadow-lg border-white/5 border z-50",
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
                  withHandle
                  className="hover:bg-primary/10 active:bg-primary/20 bg-transparent transition-colors duration-200 mt-2 mb-2"
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

        <ResizableHandle withHandle className="hover:bg-primary/10 active:bg-primary/20 bg-transparent transition-colors duration-200" />

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
              scrollToBottom={scrollToBottom}
            />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
})

export default ChatWindowComponentV3

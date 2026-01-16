import { ArtifactsPanel } from '@renderer/components/artifacts'
import ChatHeaderComponent from "@renderer/components/chat/ChatHeaderComponent"
import ChatInputArea from "@renderer/components/chat/chatInput/ChatInputArea"
import ChatMessageComponent from "@renderer/components/chat/chatMessage/ChatMessageComponent"
import WelcomeMessage from "@renderer/components/chat/welcome/WelcomeMessageNext2"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@renderer/components/ui/resizable'
import { useChatContext } from '@renderer/context/ChatContext'
import { cn } from '@renderer/lib/utils'
import { useChatStore } from '@renderer/store'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, FileCode, Monitor } from 'lucide-react'
import React, { forwardRef, memo, useCallback, useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useChatScroll } from './useChatScroll'

const ChatMessageRow: React.FC<{
  messageIndex: number
  isLatest: boolean
  onTyping: () => void
}> = memo(({ messageIndex, isLatest, onTyping }) => {
  const message = useChatStore(state => state.messages[messageIndex])

  if (!message) return null

  return (
    <ChatMessageComponent
      message={message.body}
      index={messageIndex}
      isLatest={isLatest}
      onTypingChange={onTyping}
    />
  )
})

const ChatWindowComponentV2: React.FC = forwardRef<HTMLDivElement>(() => {
  // CRITICAL: Use selectors to prevent unnecessary re-renders
  // Only subscribe to specific slices instead of the entire store
  const messageKeys = useChatStore(
    useShallow(state => state.messages.map((msg, idx) => msg.id ?? `temp-${idx}`))
  )
  const artifactsPanelOpen = useChatStore(state => state.artifactsPanelOpen)
  const artifacts = useChatStore(state => state.artifacts)
  const setArtifactsPanel = useChatStore(state => state.setArtifactsPanel)
  const setArtifactsActiveTab = useChatStore(state => state.setArtifactsActiveTab)

  const { chatUuid } = useChatContext()

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
    messageCount: messageKeys.length,
    scrollContainerRef,
    chatListRef,
    chatPaddingElRef
  })

  // Welcome page state
  const [showWelcome, setShowWelcome] = useState<boolean>(true)
  const hasShownWelcomeRef = useRef<boolean>(false)

  // 方案 4: 预览 + 快速发送 - 存储建议的 prompt
  const [suggestedPrompt, setSuggestedPrompt] = useState<string>('')

  // 处理示例卡片点击
  const handleSuggestionClick = useCallback((suggestion: any) => {
    setSuggestedPrompt(suggestion.prompt)
  }, [])

  // Detect first message - hide welcome after scroll completes
  useEffect(() => {
    if (messageKeys.length > 0 && showWelcome && !hasShownWelcomeRef.current) {
      hasShownWelcomeRef.current = true
      // Wait for scroll animation to complete before hiding welcome
      setTimeout(() => {
        setShowWelcome(false)
      }, 50)
    }
  }, [messageKeys.length, showWelcome])

  // Reset welcome page on chat switch
  useEffect(() => {
    if (messageKeys.length === 0) {
      setShowWelcome(true)
      hasShownWelcomeRef.current = false
    }
  }, [chatUuid, messageKeys.length])

  const totalCount = messageKeys.length + (showWelcome ? 1 : 0)
  const getItemKey = useCallback((index: number) => {
    if (showWelcome) {
      if (index === 0) return 'welcome'
      return messageKeys[index - 1] ?? `msg-${index - 1}`
    }
    return messageKeys[index] ?? `msg-${index}`
  }, [showWelcome, messageKeys])

  const estimateSize = useCallback(() => 120, [])

  const rowVirtualizer = useVirtualizer({
    count: totalCount,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize,
    overscan: 6,
    gap: 8,
    getItemKey
  })

  return (
    <div className="min-h-svh max-h-svh overflow-hidden flex flex-col app-undragable bg-chat-light dark:bg-chat-dark">
      <ChatHeaderComponent />

      {/* 外层垂直分割容器 */}
      <ResizablePanelGroup
        direction="vertical"
        className="flex-grow mt-12 overflow-hidden"
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
                  className="relative w-full"
                  style={{ height: rowVirtualizer.getTotalSize() }}
                >
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const isWelcomeRow = showWelcome && virtualRow.index === 0
                    const messageIndex = showWelcome ? virtualRow.index - 1 : virtualRow.index
                    const isLatest = messageIndex === messageKeys.length - 1

                    return (
                      <div
                        key={virtualRow.key}
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                        className="w-full"
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          transform: `translateY(${virtualRow.start}px)`
                        }}
                      >
                        {isWelcomeRow ? (
                          <WelcomeMessage onSuggestionClick={handleSuggestionClick} />
                        ) : messageIndex >= 0 ? (
                          <ChatMessageRow
                            messageIndex={messageIndex}
                            isLatest={isLatest}
                            onTyping={onTyping}
                          />
                        ) : null}
                      </div>
                    )
                  })}
                </div>
                <div id="scrollBottomEl" ref={chatPaddingElRef} className="h-px"></div>
              </div>

              {/* ScrollToBottom 按钮 - 绝对定位在 ChatPanel 底部中间 */}
              {showScrollToBottom && (
                <div
                  id="scrollToBottom"
                  onClick={() => scrollToBottom(true)}
                  className={cn(
                    "absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/5 backdrop-blur-xl cursor-pointer rounded-full shadow-lg border-white/5 border-[1px] z-50",
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

        {/* ========== 垂直分隔符 ========== */}
        <ResizableHandle
          withHandle
          className="!w-full flex items-center justify-center bg-transparent transition-all duration-200 group before:content-[''] before:absolute before:w-0 before:h-full before:bg-transparent before:hover:bg-primary/10 before:active:bg-primary/20 before:transition-colors before:duration-200 [&>div]:opacity-0 [&>div]:group-hover:opacity-100 [&>div]:transition-opacity [&>div]:duration-200"
        />

        {/* ========== 下部面板：ChatInputArea ========== */}
        <ResizablePanel
          id="input-area-panel"
          defaultSize={25}
          minSize={25}
          maxSize={55}
          className="flex flex-col overflow-hidden"
        >
          <ChatInputArea
            ref={inputAreaRef}
            onMessagesUpdate={onMessagesUpdate}
            suggestedPrompt={suggestedPrompt}
          />
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Floating Artifacts Toggle - Pill Design */}
      {artifacts && !artifactsPanelOpen && (
        <div
          className={cn(
            "fixed right-2.5 top-1/3 -translate-y-1/2 flex flex-col gap-0.5 p-0.5 z-50",
            "bg-white/10 dark:bg-black/40 backdrop-blur-2xl border border-gray-200/50 dark:border-white/10 rounded-full shadow-2xl animate-in fade-in slide-in-from-right duration-500"
          )}
        >
          <button
            className="p-2 rounded-full text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/10 transition-all group relative"
            onClick={() => {
              setArtifactsActiveTab('preview')
              setArtifactsPanel(true)
            }}
            title="Open Preview"
          >
            <Monitor className="w-4 h-4" />
            <div className="absolute right-full mr-2 px-2 py-1 rounded bg-gray-900 text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">Preview</div>
          </button>

          <div className="mx-1.5 h-px bg-gray-200/50 dark:bg-white/10" />

          <button
            className="p-2 rounded-full text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/10 transition-all group relative"
            onClick={() => {
              setArtifactsActiveTab('files')
              setArtifactsPanel(true)
            }}
            title="Open Files"
          >
            <FileCode className="w-4 h-4" />
            <div className="absolute right-full mr-2 px-2 py-1 rounded bg-gray-900 text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">Files</div>
          </button>
        </div>
      )}
    </div>
  )
})

export default ChatWindowComponentV2

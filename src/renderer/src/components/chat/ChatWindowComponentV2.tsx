import { ArtifactsPanel } from '@renderer/components/artifacts'
import ChatHeaderComponent from "@renderer/components/chat/ChatHeaderComponent"
import ChatInputArea from "@renderer/components/chat/ChatInputArea"
import ChatMessageComponent from "@renderer/components/chat/ChatMessageComponent"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@renderer/components/ui/resizable'
import { useChatContext } from '@renderer/context/ChatContext'
import { useIntersectionObserver } from '@renderer/hooks/useIntersectionObserver'
import { useScrollToBottom } from '@renderer/hooks/useScrollToBottom'
import { cn } from '@renderer/lib/utils'
import { useChatStore } from '@renderer/store'
import { ArrowDown, FileCode, Monitor } from 'lucide-react'
import React, { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react'

const ChatWindowComponentV2: React.FC = forwardRef<HTMLDivElement>(() => {
  const {
    messages,
    artifactsPanelOpen,
    artifacts,
    setArtifactsPanel,
    setArtifactsActiveTab
  } = useChatStore()
  const { chatUuid } = useChatContext()

  // 优化 messages 依赖粒度 - 只在消息数量或最后一条消息内容变化时触发
  const messagesLength = useMemo(() => messages.length, [messages])
  const lastMessageContent = useMemo(() => {
    const lastMsg = messages[messages.length - 1]
    return lastMsg?.body?.content || ''
  }, [messages])

  // 状态
  const [showScrollToBottom, setShowScrollToBottom] = useState<boolean>(false)
  const [isButtonFadingOut, setIsButtonFadingOut] = useState<boolean>(false)

  // Refs - 大幅简化
  const inputAreaRef = useRef<HTMLDivElement>(null)
  const chatListRef = useRef<HTMLDivElement>(null)
  const lastChatUuidRef = useRef<string | undefined>(undefined)
  const lastScrollTopRef = useRef<number>(0)
  const isUserScrollingRef = useRef<boolean>(false) // 标记用户是否正在主动滚动

  // 使用新的 hooks
  const {
    scrollToBottom,
    scrollToBottomThrottled,
    targetRef: scrollContainerRef
  } = useScrollToBottom({
    onScrollEnd: () => {
      setShowScrollToBottom(false)
      setIsButtonFadingOut(false)
    }
  })

  // 使用 Intersection Observer 检测是否在底部
  const { targetRef: bottomMarkerRef, isIntersecting: isAtBottom } = useIntersectionObserver({
    rootMargin: '10px'
  })

  // 简化的回调函数
  const scrollToBottomForced = useCallback(() => {
    // 平滑滚动，带淡出效果
    setIsButtonFadingOut(true)
    setTimeout(() => {
      scrollToBottom(true)
    }, 150)
  }, [scrollToBottom])

  const onMessagesUpdate = useCallback(() => {
    // 用户提交消息后强制滚动到底部
    scrollToBottomForced()
  }, [scrollToBottomForced])

  // 监听用户主动滚动
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const currentScrollTop = container.scrollTop
    const scrollHeight = container.scrollHeight
    const clientHeight = container.clientHeight
    const distanceFromBottom = scrollHeight - currentScrollTop - clientHeight

    // 判断是否在底部（距离底部小于 10px）
    const isNearBottom = distanceFromBottom < 10

    // 检测滚动方向
    const isScrollingUp = currentScrollTop < lastScrollTopRef.current
    lastScrollTopRef.current = currentScrollTop

    // 如果用户向上滚动且不在底部，标记为用户主动滚动
    if (isScrollingUp && !isNearBottom) {
      isUserScrollingRef.current = true
      setShowScrollToBottom(true)
      setIsButtonFadingOut(false)
    } else if (isNearBottom) {
      // 如果滚动到底部，重置标记
      isUserScrollingRef.current = false
      setShowScrollToBottom(false)
      setIsButtonFadingOut(false)
    }
  }, [])

  // useEffect: 监听滚动事件
  useEffect(() => {
    const container = scrollContainerRef.current
    if (container) {
      container.addEventListener('scroll', handleScroll, { passive: true })
    }
    return () => {
      if (container) {
        container.removeEventListener('scroll', handleScroll)
      }
    }
  }, [handleScroll])

  // useEffect: 根据 isAtBottom 控制按钮显示（仅作为辅助）
  useEffect(() => {
    if (isAtBottom && !isUserScrollingRef.current) {
      setShowScrollToBottom(false)
      setIsButtonFadingOut(false)
    }
  }, [isAtBottom])

  // useEffect: 聊天切换时立即滚动
  useEffect(() => {
    if (lastChatUuidRef.current !== chatUuid) {
      lastChatUuidRef.current = chatUuid
      // 聊天切换时重置用户滚动标记
      isUserScrollingRef.current = false
      // 延迟滚动，等待 DOM 渲染完成
      setTimeout(() => {
        scrollToBottom(false)
      }, 100)
    }
  }, [chatUuid, scrollToBottom])

  // useEffect: 消息更新时滚动（仅当用户在底部且未主动滚动）
  useEffect(() => {
    if (!showScrollToBottom && !isUserScrollingRef.current) {
      scrollToBottomThrottled()
    }
  }, [messagesLength, lastMessageContent, showScrollToBottom, scrollToBottomThrottled])

  // 打字机效果的滚动回调（仅当用户在底部且未主动滚动）
  const handleTyping = useCallback(() => {
    if (!showScrollToBottom && !isUserScrollingRef.current) {
      scrollToBottomThrottled()
    }
  }, [showScrollToBottom, scrollToBottomThrottled])

  return (
    <div className="min-h-svh max-h-svh overflow-hidden flex flex-col app-undragable bg-chat-light dark:bg-chat-dark">
      <ChatHeaderComponent />

      {/* 水平分割容器 - 使用 Resizable 组件 */}
      <ResizablePanelGroup
        direction="horizontal"
        className="flex-grow mt-12 overflow-hidden"
      >
        {/* 左侧：聊天区域 */}
        <ResizablePanel
          defaultSize={artifactsPanelOpen ? 60 : 100}
          minSize={30}
          className="flex flex-col overflow-hidden"
          id="chat-panel"
        >
          <div ref={scrollContainerRef} className="flex-1 app-undragable overflow-scroll">
            <div ref={chatListRef} id='chat-list' className="w-full flex-grow flex flex-col space-y-2 px-2">
              {messages.length !== 0 && messages.map((message, index) => {
                return (
                  <ChatMessageComponent
                    key={index}
                    message={message.body}
                    index={index}
                    isLatest={index === messages.length - 1}
                    onTypingChange={handleTyping}
                  />
                )
              })}

              {/* 流式响应加载指示器 */}
              {/* {showLoadingIndicator && selectedModel && (
          <div className="flex justify-start flex-col pb-0.5 w-20">
            <Badge variant="outline" className='select-none text-gray-700 mb-1 animate-pulse'>
              @{selectedModel.name}
            </Badge>
            <div className="space-y-2 mt-2">
              <Skeleton className="h-4 w-32 rounded-full bg-black/5" />
            </div>
          </div>
        )} */}

              {/* WebSearch 加载指示器 */}
              {/* {webSearchEnable && webSearchProcessing && (
          <div className="space-y-2">
            <Skeleton className="h-4 w-[60%] rounded-full bg-black/5" />
            <Skeleton className="h-4 w-[40%] rounded-full bg-black/5" />
          </div>
        )} */}
              {/* ScrollToBottom 按钮 - 根据滚动状态显示/隐藏 */}
              {showScrollToBottom && (
                <div
                  id="scrollToBottom"
                  onClick={() => {
                    isUserScrollingRef.current = false
                    scrollToBottom(true)
                  }}
                  className={cn(
                    "fixed p-0.5 bottom-60 left-1/2 -translate-x-1/2 bg-black/5 backdrop-blur-xl cursor-pointer rounded-full shadow-lg border-white/5 border-[1px] z-50",
                    "transition-all duration-300 ease-out hover:scale-110",
                    isButtonFadingOut
                      ? "opacity-0 translate-y-5 scale-75"
                      : "opacity-100 translate-y-0"
                  )}
                >
                  <ArrowDown className="text-gray-400 p-1 m-1" />
                </div>
              )}
            </div>
            {/* 底部标记 - 用于 Intersection Observer 检测 */}
            <div ref={bottomMarkerRef} className="h-px"></div>
          </div>
        </ResizablePanel>

        {/* 右侧：Artifacts 面板（可调整大小） */}
        {artifactsPanelOpen && (
          <>
            <ResizableHandle
              withHandle
              className="hover:bg-primary/20 active:bg-primary/30 transition-colors duration-200"
            />
            <ResizablePanel
              defaultSize={40}
              minSize={25}
              maxSize={70}
              collapsible={true}
              collapsedSize={0}
              onResize={(size) => {
                // 当面板被折叠到 0 时，同步更新 artifactsPanelOpen 状态
                // 这样 Floating Toggle 就能正常显示了
                if (size === 0 && artifactsPanelOpen) {
                  setArtifactsPanel(false)
                }
              }}
              className="bg-background overflow-hidden"
              id="artifacts-panel"
            >
              <div className="h-full w-full overflow-hidden">
                <ArtifactsPanel />
              </div>
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>

      {/* just as a padding element */}
      <div className="pb-52 bg-transparent select-none">&nbsp;</div>
      <ChatInputArea
        ref={inputAreaRef}
        onMessagesUpdate={onMessagesUpdate}
      />

      {/* Floating Artifacts Toggle - Pill Design */}
      {artifacts && !artifactsPanelOpen && (
        <div
          className={cn(
            "fixed right-2.5 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 p-0.5 z-50",
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
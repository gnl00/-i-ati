import { ArtifactsPanel } from '@renderer/components/artifacts'
import ChatHeaderComponent from "@renderer/components/chat/ChatHeaderComponent"
import ChatInputArea from "@renderer/components/chat/chatInput/ChatInputArea"
import ChatMessageComponent from "@renderer/components/chat/chatMessage/ChatMessageComponent"
import WelcomeMessage from "@renderer/components/chat/welcome/WelcomeMessageNext2"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@renderer/components/ui/resizable'
import { useChatContext } from '@renderer/context/ChatContext'
import { cn } from '@renderer/lib/utils'
import { useChatStore } from '@renderer/store'
import { ArrowDown, FileCode, Monitor } from 'lucide-react'
import React, { forwardRef, useCallback, useDeferredValue, useEffect, useRef, useState } from 'react'

const ChatWindowComponentV2: React.FC = forwardRef<HTMLDivElement>(() => {
  // CRITICAL: Use selectors to prevent unnecessary re-renders
  // Only subscribe to specific slices instead of the entire store
  const messages = useChatStore(state => state.messages)
  const artifactsPanelOpen = useChatStore(state => state.artifactsPanelOpen)
  const artifacts = useChatStore(state => state.artifacts)
  const setArtifactsPanel = useChatStore(state => state.setArtifactsPanel)
  const setArtifactsActiveTab = useChatStore(state => state.setArtifactsActiveTab)

  // Use useDeferredValue to keep UI responsive during streaming
  // This delays the rendering of messages list, prioritizing user input
  const deferredMessages = useDeferredValue(messages)

  const { chatUuid } = useChatContext()

  const inputAreaRef = useRef<HTMLDivElement>(null)
  const chatListRef = useRef<HTMLDivElement>(null)
  const chatPaddingElRef = useRef<HTMLDivElement>(null)
  const lastChatUuidRef = useRef<string | undefined>(undefined)
  const smoothScrollRAFRef = useRef<number>(0) // 平滑滚动的 RAF ref
  const autoScrollRAFRef = useRef<number>(0)
  const isStickToBottomRef = useRef<boolean>(true)
  const isSmoothScrollingRef = useRef<boolean>(false)

  const [showScrollToBottom, setShowScrollToBottom] = useState<boolean>(false)
  const [isButtonFadingOut, setIsButtonFadingOut] = useState<boolean>(false) // 按钮淡出状态

  // Welcome page state
  const [showWelcome, setShowWelcome] = useState<boolean>(true)
  const hasShownWelcomeRef = useRef<boolean>(false)

  // 方案 4: 预览 + 快速发送 - 存储建议的 prompt
  const [suggestedPrompt, setSuggestedPrompt] = useState<string>('')

  // 处理示例卡片点击
  const handleSuggestionClick = useCallback((suggestion: any) => {
    setSuggestedPrompt(suggestion.prompt)
  }, [])

  // 缓动函数：easeOutCubic - 快速开始，缓慢结束
  const easeOutCubic = useCallback((t: number): number => {
    return 1 - Math.pow(1 - t, 3)
  }, [])

  // 自定义平滑滚动到底部
  const smoothScrollToBottom = useCallback(() => {
    const container = chatListRef.current?.parentElement
    if (!container) return

    // 取消之前的滚动动画
    if (smoothScrollRAFRef.current) {
      cancelAnimationFrame(smoothScrollRAFRef.current)
      smoothScrollRAFRef.current = 0
    }
    isSmoothScrollingRef.current = false

    const startPos = container.scrollTop
    // 在每一帧都重新计算目标位置，以应对内容高度变化
    const getEndPos = () => container.scrollHeight - container.clientHeight
    const initialEndPos = getEndPos()
    const initialDistance = initialEndPos - startPos

    // 如果已经在底部，直接返回
    if (Math.abs(initialDistance) < 1) {
      setShowScrollToBottom(false)
      setIsButtonFadingOut(false)
      isSmoothScrollingRef.current = false
      return
    }

    // 根据滚动距离动态调整动画时长（最小 300ms，最大 800ms）
    const duration = Math.min(Math.max(Math.abs(initialDistance) * 0.5, 300), 800)
    const startTime = performance.now()
    isSmoothScrollingRef.current = true

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = easeOutCubic(progress)

      // 在每一帧重新计算目标位置，确保滚动到真正的底部
      const currentEndPos = getEndPos()
      const currentDistance = currentEndPos - startPos

      // 使用当前计算的距离和目标位置
      container.scrollTop = startPos + currentDistance * eased

      // 检查是否已经到达底部（允许一些误差）
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
      const isAtBottom = distanceFromBottom < 1

      if (progress < 1 && !isAtBottom) {
        smoothScrollRAFRef.current = requestAnimationFrame(animate)
      } else {
        // 确保滚动到真正的底部
        container.scrollTop = currentEndPos

        // 动画完成
        smoothScrollRAFRef.current = 0
        isSmoothScrollingRef.current = false

        // 隐藏按钮
        setShowScrollToBottom(false)
        setIsButtonFadingOut(false)
      }
    }

    smoothScrollRAFRef.current = requestAnimationFrame(animate)
  }, [easeOutCubic])

  // 所有函数定义
  const autoScrollToBottom = useCallback(() => {
    const container = chatListRef.current?.parentElement
    if (!container) return
    container.scrollTop = container.scrollHeight - container.clientHeight
  }, [])

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
    setShowScrollToBottom(false)

    if (smooth) {
      // 使用自定义平滑滚动
      setIsButtonFadingOut(true)

      // 延迟一点开始滚动，让用户看到按钮淡出
      setTimeout(() => {
        smoothScrollToBottom()
      }, 120)
    } else {
      autoScrollToBottom()
    }
  }, [autoScrollToBottom, smoothScrollToBottom])

  const scrollToBottomForced = useCallback(() => {
    // 强制滚动到底部，用于用户主动提交消息后
    setTimeout(() => {
      scrollToBottom(true)
    }, 100)
  }, [scrollToBottom])

  const onMessagesUpdate = () => {
    // 用户提交消息后强制滚动到底部
    scrollToBottomForced()
  }

  const onChatListScroll = useCallback((evt: Event) => {
    const target = evt.target as HTMLDivElement
    const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight
    const isAtBottom = distanceFromBottom < 10
    if (isSmoothScrollingRef.current) {
      if (isAtBottom) {
        isStickToBottomRef.current = true
        setShowScrollToBottom(false)
        setIsButtonFadingOut(false)
      }
      return
    }

    if (isAtBottom) {
      if (!isStickToBottomRef.current) {
        isStickToBottomRef.current = true
      }
      setShowScrollToBottom(prev => {
        if (prev) {
          setIsButtonFadingOut(false)
        }
        return false
      })
    } else {
      if (isStickToBottomRef.current) {
        isStickToBottomRef.current = false
      }
      setShowScrollToBottom(prev => {
        if (!prev) {
          setIsButtonFadingOut(false)
        }
        return true
      })
    }
  }, [])

  const onUserScrollIntent = useCallback(() => {
    if (!isSmoothScrollingRef.current) return
    cancelSmoothScroll()
    isStickToBottomRef.current = false
    setShowScrollToBottom(true)
    setIsButtonFadingOut(false)
  }, [cancelSmoothScroll])

  // useEffect hooks
  useEffect(() => {
    // 监听聊天列表容器的滚动，而不是 window
    const chatListElement = chatListRef.current?.parentElement
    if (chatListElement) {
      chatListElement.addEventListener('scroll', onChatListScroll)
      chatListElement.addEventListener('wheel', onUserScrollIntent, { passive: true })
      chatListElement.addEventListener('touchstart', onUserScrollIntent, { passive: true })
      chatListElement.addEventListener('pointerdown', onUserScrollIntent)
    }

    return () => {
      if (chatListElement) {
        chatListElement.removeEventListener('scroll', onChatListScroll)
        chatListElement.removeEventListener('wheel', onUserScrollIntent)
        chatListElement.removeEventListener('touchstart', onUserScrollIntent)
        chatListElement.removeEventListener('pointerdown', onUserScrollIntent)
      }
      // 清理动画帧
      if (autoScrollRAFRef.current) {
        cancelAnimationFrame(autoScrollRAFRef.current)
        autoScrollRAFRef.current = 0
      }
      if (smoothScrollRAFRef.current) {
        cancelSmoothScroll()
      }
    }
  }, [onChatListScroll, onUserScrollIntent, cancelSmoothScroll])

  // 当用户向上滚动时，取消所有自动滚动
  useEffect(() => {
    if (showScrollToBottom && autoScrollRAFRef.current) {
      cancelAnimationFrame(autoScrollRAFRef.current)
      autoScrollRAFRef.current = 0
    }
  }, [showScrollToBottom])

  // 1. 聊天切换时：强制立即滚动
  useEffect(() => {
    const prevChatUuid = lastChatUuidRef.current
    const currentChatUuid = chatUuid
    // 检测是否是聊天切换（chatUuid 发生变化）
    const isChatSwitch = prevChatUuid !== currentChatUuid
    // 更新 chatUuid 记录
    lastChatUuidRef.current = currentChatUuid
    if (isChatSwitch) {
      isStickToBottomRef.current = true
      setShowScrollToBottom(false)
      setIsButtonFadingOut(false)
      cancelSmoothScroll()
      // 聊天切换时需要延迟滚动，等待 DOM 渲染完成
      // 使用 requestAnimationFrame + setTimeout 确保 DOM 已经更新
      if (chatPaddingElRef.current) {
        requestAnimationFrame(() => {
          setTimeout(() => {
            // 使用 auto 而不是 smooth，立即滚动
            scrollToBottom(false)
          }, 100)
        })
      }
    }
  }, [chatUuid, cancelSmoothScroll, scrollToBottom])

  // Detect first message - hide welcome after scroll completes
  useEffect(() => {
    if (messages.length > 0 && showWelcome && !hasShownWelcomeRef.current) {
      hasShownWelcomeRef.current = true
      // Wait for scroll animation to complete before hiding welcome
      setTimeout(() => {
        setShowWelcome(false)
      }, 50)
    }
  }, [messages.length, showWelcome])

  // Reset welcome page on chat switch
  useEffect(() => {
    if (messages.length === 0) {
      setShowWelcome(true)
      hasShownWelcomeRef.current = false
    }
  }, [chatUuid, messages.length])

  useEffect(() => {
    scheduleAutoScroll()
  }, [messages, scheduleAutoScroll])

  // 打字机效果触发的滚动（与普通滚动逻辑解耦）
  const handleTyping = useCallback(() => {
    scheduleAutoScroll()
  }, [scheduleAutoScroll])

  // 监听聊天内容高度变化（用于 typewriter 效果期间的自动滚动）
  useEffect(() => {
    const chatListElement = chatListRef.current
    if (!chatListElement) return

    // 使用 ResizeObserver 监听内容高度变化
    const resizeObserver = new ResizeObserver(() => {
      scheduleAutoScroll()
    })

    resizeObserver.observe(chatListElement)

    return () => {
      resizeObserver.disconnect()
    }
  }, [scheduleAutoScroll])

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
              <div className="flex-1 app-undragable overflow-scroll">
                <div ref={chatListRef} id='chat-list' className="w-full flex-grow flex flex-col space-y-2 px-2">
                  {showWelcome && (
                    <WelcomeMessage onSuggestionClick={handleSuggestionClick} />
                  )}
                  {deferredMessages.length === 0 ? null : (
                    deferredMessages.map((message, index) => {
                      return (
                        <ChatMessageComponent
                          key={message.id || index}
                          message={message.body}
                          index={index}
                          isLatest={index === deferredMessages.length - 1}
                          onTypingChange={handleTyping}
                        />
                      )
                    })
                  )}
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

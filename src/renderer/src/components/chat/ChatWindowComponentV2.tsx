import { ArtifactsPanel } from '@renderer/components/artifacts'
import ChatHeaderComponent from "@renderer/components/chat/ChatHeaderComponent"
import ChatInputArea from "@renderer/components/chat/ChatInputArea"
import ChatMessageComponent from "@renderer/components/chat/ChatMessageComponent"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@renderer/components/ui/resizable'
import { useChatContext } from '@renderer/context/ChatContext'
import { cn } from '@renderer/lib/utils'
import { useChatStore } from '@renderer/store'
import { ArrowDown, FileCode, Monitor } from 'lucide-react'
import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react'

const ChatWindowComponentV2: React.FC = forwardRef<HTMLDivElement>(() => {
  const {
    messages,
    artifactsPanelOpen,
    artifacts,
    setArtifactsPanel,
    setArtifactsActiveTab
  } = useChatStore()
  const { chatUuid } = useChatContext()

  const inputAreaRef = useRef<HTMLDivElement>(null)
  const chatListRef = useRef<HTMLDivElement>(null)
  const chatPaddingElRef = useRef<HTMLDivElement>(null)
  const lastScrollTopRef = useRef<number>(0)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const scrollRAFRef = useRef<number>(0)
  const typingScrollRAFRef = useRef<number>(0) // 独立的 RAF ref 用于打字机滚动
  const lastChatUuidRef = useRef<string | undefined>(undefined)
  const isAutoScrollingRef = useRef<boolean>(false) // 标记是否正在自动滚动
  const lastTypingScrollTimeRef = useRef<number>(0) // 上次打字机滚动的时间
  const smoothScrollRAFRef = useRef<number>(0) // 平滑滚动的 RAF ref

  const [showScrollToBottom, setShowScrollToBottom] = useState<boolean>(false)
  const [isButtonFadingOut, setIsButtonFadingOut] = useState<boolean>(false) // 按钮淡出状态
  const [inputAreaTextareaHeight, setInputAreaTextareaHeight] = useState<number>(150) // ChatInputArea 的 textarea 高度

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

    const startPos = container.scrollTop
    // 在每一帧都重新计算目标位置，以应对内容高度变化
    const getEndPos = () => container.scrollHeight - container.clientHeight
    const initialEndPos = getEndPos()
    const initialDistance = initialEndPos - startPos

    // 如果已经在底部，直接返回
    if (Math.abs(initialDistance) < 1) {
      setShowScrollToBottom(false)
      setIsButtonFadingOut(false)
      return
    }

    // 根据滚动距离动态调整动画时长（最小 300ms，最大 800ms）
    const duration = Math.min(Math.max(Math.abs(initialDistance) * 0.5, 300), 800)
    const startTime = performance.now()

    // 标记自动滚动开始
    isAutoScrollingRef.current = true

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

        // 重置自动滚动标志
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            isAutoScrollingRef.current = false
          })
        })

        // 隐藏按钮
        setShowScrollToBottom(false)
        setIsButtonFadingOut(false)
      }
    }

    smoothScrollRAFRef.current = requestAnimationFrame(animate)
  }, [easeOutCubic])

  // 所有函数定义
  // 节流 + RAF 优化的滚动函数（用于流式输出）
  const scrollToBottomThrottled = useCallback(() => {
    // 取消之前的 RAF（如果有）
    if (scrollRAFRef.current) {
      cancelAnimationFrame(scrollRAFRef.current)
    }

    // 清除之前的 timeout（如果有）
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
    }

    // 设置新的 timeout
    scrollTimeoutRef.current = setTimeout(() => {
      // 使用 RAF 与浏览器重绘同步
      scrollRAFRef.current = requestAnimationFrame(() => {
        if (chatPaddingElRef.current) {
          // 标记开始自动滚动
          isAutoScrollingRef.current = true

          chatPaddingElRef.current.scrollIntoView({
            behavior: "auto",
            block: "end"
          })

          // 滚动完成后重置标志
          setTimeout(() => {
            isAutoScrollingRef.current = false
          }, 50)
        }
        scrollRAFRef.current = 0
      })
      scrollTimeoutRef.current = null
    }, 100) // 100ms 去抖
  }, [])

  const scrollToBottom = useCallback((smooth = false) => {
    if (smooth) {
      // 使用自定义平滑滚动
      // 先触发按钮淡出动画
      setIsButtonFadingOut(true)

      // 延迟一点开始滚动，让用户看到按钮淡出
      setTimeout(() => {
        smoothScrollToBottom()
      }, 150)
    } else {
      // 快速滚动（用于聊天切换等场景）
      if (chatPaddingElRef.current) {
        const scrollElement = chatPaddingElRef.current

        // 标记开始自动滚动
        isAutoScrollingRef.current = true

        scrollElement.scrollIntoView({
          behavior: 'auto',
          block: 'end'
        })

        // 滚动完成后重置标志
        setTimeout(() => {
          isAutoScrollingRef.current = false
        }, 50)

        // 滚动后隐藏按钮
        setShowScrollToBottom(false)
      }
    }
  }, [smoothScrollToBottom])

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
    const scrollTop = target.scrollTop
    const scrollHeight = target.scrollHeight
    const clientHeight = target.clientHeight
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight

    // 判断是否接近底部（距离底部小于 10px 认为在底部）
    const isAtBottom = distanceFromBottom < 10

    // 核心逻辑：如果在底部，隐藏按钮；如果不在底部，显示按钮
    // 不再判断滚动方向，只看位置
    if (isAtBottom) {
      // 使用函数式更新，只在状态真正改变时才触发更新
      setShowScrollToBottom(prev => {
        if (prev !== false) {
          setIsButtonFadingOut(false)
        }
        return false
      })
      // 更新 lastScrollTop，避免下次误判
      lastScrollTopRef.current = scrollTop
    } else {
      // 不在底部
      // 如果是自动滚动触发的，只更新 lastScrollTop，不显示按钮
      if (isAutoScrollingRef.current) {
        // 仍然更新 lastScrollTop 以保持状态同步
        lastScrollTopRef.current = scrollTop
        return
      }

      // 判断滚动方向：只有向上滚动才显示按钮
      const isScrollingUp = scrollTop < lastScrollTopRef.current
      lastScrollTopRef.current = scrollTop

      if (isScrollingUp) {
        setShowScrollToBottom(true)
        setIsButtonFadingOut(false) // 重置淡出状态
      }
    }
  }, [])

  // useEffect hooks
  useEffect(() => {
    // 监听聊天列表容器的滚动，而不是 window
    const chatListElement = chatListRef.current?.parentElement
    if (chatListElement) {
      chatListElement.addEventListener('scroll', onChatListScroll)
    }

    return () => {
      if (chatListElement) {
        chatListElement.removeEventListener('scroll', onChatListScroll)
      }
      // 清理定时器和动画帧
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
      if (scrollRAFRef.current) {
        cancelAnimationFrame(scrollRAFRef.current)
      }
      if (typingScrollRAFRef.current) {
        cancelAnimationFrame(typingScrollRAFRef.current)
      }
      if (smoothScrollRAFRef.current) {
        cancelAnimationFrame(smoothScrollRAFRef.current)
      }
    }
  }, [onChatListScroll])

  // 当用户向上滚动时，取消所有自动滚动
  useEffect(() => {
    if (showScrollToBottom) {
      // 用户向上滚动了，取消所有待执行的自动滚动
      if (typingScrollRAFRef.current) {
        cancelAnimationFrame(typingScrollRAFRef.current)
        typingScrollRAFRef.current = 0
      }
      if (scrollRAFRef.current) {
        cancelAnimationFrame(scrollRAFRef.current)
        scrollRAFRef.current = 0
      }
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
        scrollTimeoutRef.current = null
      }
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
  }, [chatUuid])

  useEffect(() => {
    // 滚动逻辑：
    // 2. 用户在底部（按钮不可见）：节流滚动
    // 3. 用户向上滚动（按钮可见）：不滚动
    if (!showScrollToBottom) {
      // 正常流式输出时使用节流滚动（仅当用户在底部）
      scrollToBottomThrottled()
    }
  }, [messages, showScrollToBottom, scrollToBottomThrottled])

  // 打字机效果的滚动回调（节流版本）
  const handleTyping = useCallback(() => {
    if (!showScrollToBottom) {
      const now = Date.now()
      const timeSinceLastScroll = now - lastTypingScrollTimeRef.current

      // 节流：每 100ms 最多滚动一次
      if (timeSinceLastScroll < 100) {
        return
      }

      // 使用独立的 RAF ref，避免与其他滚动逻辑冲突
      // 如果已经有待处理的 RAF，就跳过这次调用
      if (!typingScrollRAFRef.current) {
        lastTypingScrollTimeRef.current = now

        typingScrollRAFRef.current = requestAnimationFrame(() => {
          if (chatPaddingElRef.current) {
            // 标记开始自动滚动
            isAutoScrollingRef.current = true

            chatPaddingElRef.current.scrollIntoView({
              behavior: "auto",
              block: "end"
            })

            // 滚动完成后重置标志
            // 使用 requestAnimationFrame 确保滚动已经开始
            requestAnimationFrame(() => {
              // 再等待一帧，确保滚动事件已触发
              requestAnimationFrame(() => {
                isAutoScrollingRef.current = false
              })
            })
          }
          typingScrollRAFRef.current = 0
        })
      }
    }
  }, [showScrollToBottom])

  // Handle input area height change
  const handleInputAreaHeightChange = useCallback((height: number) => {
    setInputAreaTextareaHeight(height)
  }, [])

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
          <div className="flex-1 app-undragable overflow-scroll">
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
                  onClick={() => scrollToBottom(true)}
                  style={{
                    bottom: `${inputAreaTextareaHeight + 80}px` // 动态计算：textarea 高度 + 其他元素高度（~90px）+ 间距（~20px）
                  }}
                  className={cn(
                    "fixed p-0.5 left-1/2 -translate-x-1/2 bg-black/5 backdrop-blur-xl cursor-pointer rounded-full shadow-lg border-white/5 border-[1px] z-50",
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
            <div id="scrollBottomEl" ref={chatPaddingElRef} className="h-px"></div>
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
        onInputAreaHeightChange={handleInputAreaHeightChange}
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
import ChatHeaderComponent from "@renderer/components/chat/ChatHeaderComponent"
import ChatInputArea from "@renderer/components/chat/ChatInputArea"
import ChatMessageComponent from "@renderer/components/chat/ChatMessageComponent"
import { useChatContext } from '@renderer/context/ChatContext'
import { useChatStore } from '@renderer/store'
import { ArrowDown } from 'lucide-react'
import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react'

const ChatWindowComponentV2: React.FC = forwardRef<HTMLDivElement>(() => {
  const { messages } = useChatStore()
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

  const [showScrollToBottom, setShowScrollToBottom] = useState<boolean>(false)

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
    if (chatPaddingElRef.current) {
      const scrollElement = chatPaddingElRef.current

      // 标记开始自动滚动
      isAutoScrollingRef.current = true

      scrollElement.scrollIntoView({
        behavior: smooth ? 'smooth' : 'auto',
        block: 'end'
      })

      // 滚动完成后重置标志
      setTimeout(() => {
        isAutoScrollingRef.current = false
      }, smooth ? 500 : 50) // smooth 滚动需要更长时间

      // 滚动后隐藏按钮
      setShowScrollToBottom(false)
    }
  }, [messages])

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
      setShowScrollToBottom(false)
      // 更新 lastScrollTop，避免下次误判
      lastScrollTopRef.current = scrollTop
    } else {
      // 不在底部
      // 如果是自动滚动触发的，忽略（因为自动滚动可能在滚动过程中）
      if (isAutoScrollingRef.current) {
        return
      }

      // 判断滚动方向：只有向上滚动才显示按钮
      const isScrollingUp = scrollTop < lastScrollTopRef.current
      lastScrollTopRef.current = scrollTop

      if (isScrollingUp) {
        setShowScrollToBottom(true)
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

  return (
    <div className="min-h-svh max-h-svh overflow-hidden flex flex-col app-undragable bg-chat-light dark:bg-chat-dark">
      <ChatHeaderComponent />
      <div className="flex-grow app-undragable mt-12 overflow-scroll">
        <div ref={chatListRef} id='chat-list' className="w-full flex-grow flex flex-col space-y-2 px-2" onScroll={onChatListScroll}>
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
              className="fixed bottom-60 left-1/2 -translate-x-1/2 bg-black/5 hover:bg-white backdrop-blur-xl cursor-pointer rounded-full shadow-lg border border-gray-200/50 transition-all duration-200 hover:scale-110 animate-slide-up z-50"
            >
              <ArrowDown className="text-gray-400 p-1 m-1" />
            </div>
          )}
        </div>
        <div id="scrollBottomEl" ref={chatPaddingElRef} className="h-px"></div>
      </div>
      {/* just as a padding element */}
      <div className="pb-52 bg-transparent select-none">&nbsp;</div>
      <ChatInputArea
        ref={inputAreaRef}
        onMessagesUpdate={onMessagesUpdate}
      />
    </div>
  )
})

export default ChatWindowComponentV2
import ChatHeaderComponent from "@renderer/components/chat/ChatHeaderComponent"
import ChatInputArea from "@renderer/components/chat/ChatInputArea"
import ChatMessageComponent from "@renderer/components/chat/ChatMessageComponent"
import { ArrowDown } from 'lucide-react'
import { useChatStore } from '@renderer/store'
import React, { useState, forwardRef, useEffect, useCallback, useRef } from 'react'

const ChatWindowComponentV2: React.FC = forwardRef<HTMLDivElement>(() => {
  const { messages } = useChatStore()

  const chatWindowRef = useRef<HTMLDivElement>(null)
  const inputAreaRef = useRef<HTMLDivElement>(null)
  const chatListRef = useRef<HTMLDivElement>(null)
  const chatPaddingElRef = useRef<HTMLDivElement>(null)
  const lastScrollTopRef = useRef<number>(0)

  const [ chatListHeight, setChatListHeight ] = useState<number>(0)
  const [ showScrollToBottom, setShowScrollToBottom ] = useState<boolean>(false)

  useEffect(() => {
    calculateChatListHeight()

    const handleResize = () => {
      calculateChatListHeight()
    }

    // 监听聊天列表容器的滚动，而不是 window
    const chatListElement = chatListRef.current?.parentElement
    if (chatListElement) {
      chatListElement.addEventListener('scroll', onChatListScroll)
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      if (chatListElement) {
        chatListElement.removeEventListener('scroll', onChatListScroll)
      }
    }
  }, [])

  useEffect(() => {
    calculateChatListHeight()
    if(chatPaddingElRef && chatPaddingElRef.current) {
      chatPaddingElRef.current.scrollIntoView({
        behavior: "smooth"
      })
    }
  }, [messages])

  const calculateChatListHeight = useCallback(() => {
    if (chatWindowRef.current && inputAreaRef.current) {
      const chatWindowHeight = chatWindowRef.current.offsetHeight
      const inputAreaHeight = inputAreaRef.current.offsetHeight
      setChatListHeight(chatWindowHeight - inputAreaHeight)
    }
  }, [])

  const scrollToBottom = useCallback((smooth = false) => {
    console.log('toBottom', smooth, chatPaddingElRef)
    if (chatPaddingElRef.current) {
      const scrollElement = chatPaddingElRef.current
      if (smooth) {
        scrollElement.style.scrollBehavior = 'smooth'
      } else {
        scrollElement.style.scrollBehavior = 'auto'
      }
      scrollElement.scrollIntoView()
      // 滚动后隐藏按钮
      setShowScrollToBottom(false)
    }
  }, [])

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

    // 判断滚动方向：向上滚动时显示按钮
    const isScrollingUp = scrollTop < lastScrollTopRef.current
    lastScrollTopRef.current = scrollTop

    // 判断是否接近底部（距离底部小于 100px）
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100

    // 向上滚动且不在底部时显示按钮，否则隐藏
    if (isScrollingUp && !isNearBottom) {
      setShowScrollToBottom(true)
    } else if (isNearBottom) {
      setShowScrollToBottom(false)
    }
  }, [])

  return (
    <div className="min-h-svh max-h-svh overflow-hidden flex flex-col app-undragable" style={{
      backgroundColor: '#f9f9f9',
      backgroundImage: `radial-gradient(circle at 1px 1px, rgba(139,125,102,0.15) 1px, transparent 0)`,
      backgroundSize: '50px 50px'
    }}>
    <ChatHeaderComponent />
    <div className="flex-grow app-undragable mt-12 overflow-scroll scroll-smooth">
      <div ref={chatListRef} id='chat-list' className="w-full flex-grow flex flex-col space-y-2 px-2" onScroll={onChatListScroll}>
        {messages.length !== 0 && messages.map((message, index) => {
          return (
            <ChatMessageComponent
              key={index}
              message={message.body}
              index={index}
              isLatest={index === messages.length - 1}
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
            onClick={() => { scrollToBottom(true) }}
            className="fixed bottom-60 left-1/2 -translate-x-1/2 bg-black/5 hover:bg-white backdrop-blur-xl cursor-pointer rounded-full shadow-lg border border-gray-200/50 transition-all duration-200 hover:scale-110 animate-slide-up z-50"
          >
            <ArrowDown className="text-gray-400 p-1 m-1" />
          </div>
        )}
      </div>
      <div ref={chatPaddingElRef}></div>
    </div>
    {/* just as a padding element */}
    <div className="pb-56 bg-transparent select-none">&nbsp;</div>
    <ChatInputArea
      ref={inputAreaRef}
      onMessagesUpdate={onMessagesUpdate}
      />
    </div>
  )
})

export default ChatWindowComponentV2
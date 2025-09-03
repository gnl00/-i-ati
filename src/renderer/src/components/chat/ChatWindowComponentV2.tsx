import ChatHeaderComponent from "@renderer/components/chat/ChatHeaderComponent"
import ChatInputArea from "@renderer/components/chat/ChatInputArea"
import ChatMessageComponent from "@renderer/components/chat/ChatMessageComponent"

import { Skeleton } from "@renderer/components/ui/skeleton"
import { useChatStore } from '@renderer/store'
import React, { useState, forwardRef, useEffect, useCallback, useRef } from 'react'

const ChatWindowComponentV2: React.FC = forwardRef<HTMLDivElement>(() => {
  const { 
      messages,
      webSearchEnable,
      webSearchProcessing,
      readStreamState,
  } = useChatStore()

  const chatWindowRef = useRef<HTMLDivElement>(null)
  const inputAreaRef = useRef<HTMLDivElement>(null)
  const chatListRef = useRef<HTMLDivElement>(null)
  const chatPaddingElRef = useRef<HTMLDivElement>(null)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastScrollTopRef = useRef<number>(0)
  
  const [chatListHeight, setChatListHeight] = useState<number>(0)

  useEffect(() => {
    calculateChatListHeight()
    
    const handleResize = () => {
      calculateChatListHeight()
    }
    
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      // 清理定时器
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    // console.log(messages)
    calculateChatListHeight()
    // scrollToBottomOptimized()
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

  const isAtBottom = useCallback(() => {
    if (!chatListRef.current) return false
    const { scrollTop, scrollHeight, clientHeight } = chatListRef.current
    return Math.abs(scrollHeight - scrollTop - clientHeight) < 5
  }, [])

  const scrollToBottom = useCallback((smooth = false) => {
    if (chatListRef.current) {
      const scrollElement = chatListRef.current
      if (smooth) {
        scrollElement.style.scrollBehavior = 'smooth'
      } else {
        scrollElement.style.scrollBehavior = 'auto'
      }
      scrollElement.scrollTop = scrollElement.scrollHeight
      lastScrollTopRef.current = scrollElement.scrollTop
    }
  }, [])

  const scrollToBottomOptimized = useCallback(() => {
    if (!chatListRef.current) return

    // 清除之前的定时器
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
    }

    // 检查用户是否在底部附近，如果不在就不自动滚动
    if (!isAtBottom()) return

    if (readStreamState) {
      // 流式输出时使用即时滚动，避免动画冲突
      scrollToBottom(false)
    } else {
      // 非流式输出时使用防抖的平滑滚动
      scrollTimeoutRef.current = setTimeout(() => {
        scrollToBottom(true)
      }, 100)
    }
  }, [readStreamState, isAtBottom, scrollToBottom])

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

  return (
    <div className="min-h-svh max-h-svh overflow-hidden flex flex-col app-undragable" style={{
      backgroundColor: '#f9f9f9',
      backgroundImage: `radial-gradient(circle at 1px 1px, rgba(139,125,102,0.15) 1px, transparent 0)`,
      backgroundSize: '50px 50px'
    }}>
    <ChatHeaderComponent />
    <div className="flex-grow app-undragable mt-12 overflow-scroll scroll-smooth">
      <div ref={chatListRef} id='chat-list' className="w-full flex-grow flex flex-col space-y-2 px-2">
        {messages.length !== 0 && messages.map((message, index) => (
          <ChatMessageComponent
            key={index}
            message={message.body}
            index={index}
            isLatest={index === messages.length - 1}
          />
        ))}
        {webSearchEnable && webSearchProcessing && (
          <div className="space-y-1">
            <Skeleton className=" mt-3 h-5 w-[60%] rounded-full bg-black/5"></Skeleton>
            <Skeleton className=" mt-3 h-5 w-[40%] rounded-full bg-black/5"></Skeleton>
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
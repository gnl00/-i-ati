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
  } = useChatStore()

  const chatWindowRef = useRef<HTMLDivElement>(null)
  const inputAreaRef = useRef<HTMLDivElement>(null)
  const chatListRef = useRef<HTMLDivElement>(null)
  
  const [chatListHeight, setChatListHeight] = useState<number>(0)
  const [selectedMcpTools, setSelectedMcpTools] = useState<string[]>([])
  const [mcpConfig, setMcpConfig] = useState({
    "mcpServers": {
      "filesystem": {
        "command": "npx",
        "args": [
          "-y",
          "@modelcontextprotocol/server-filesystem",
          "/Users/username/Desktop",
          "/path/to/other/allowed/dir"
        ]
      },
      "fetch": {
        "command": "uvx",
        "args": ["mcp-server-fetch"]
      },
      "everything": {
        "command": "npx",
        "args": [
          "-y",
          "@modelcontextprotocol/server-everything"
        ]
      },
      "git": {
        "command": "uvx",
        "args": ["mcp-server-git"]
      }
    }
  })
  const [mcpTools, setMcpTools] = useState<string[]>([])

  useEffect(() => {
    calculateChatListHeight()
    
    const handleResize = () => {
      calculateChatListHeight()
    }
    
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  useEffect(() => {
    // console.log(messages)
    calculateChatListHeight()
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    const tools: string[] = []
    for (const [name, cfg] of Object.entries(mcpConfig.mcpServers)) {
      tools.push(name)
    }
    setMcpTools(tools)
  }, [mcpConfig])

  const calculateChatListHeight = useCallback(() => {
    if (chatWindowRef.current && inputAreaRef.current) {
      const chatWindowHeight = chatWindowRef.current.offsetHeight
      const inputAreaHeight = inputAreaRef.current.offsetHeight
      setChatListHeight(chatWindowHeight - inputAreaHeight)
    }
  }, [])

  const scrollToBottom = useCallback(() => {
    if (chatListRef.current) {
      chatListRef.current.scrollTop = chatListRef.current.scrollHeight
    }
  }, [])

  const onSubmit = () => {
    // 延迟滚动到底部，确保新消息已经渲染
    setTimeout(() => {
      scrollToBottom()
    }, 100)
  }

  return (
    <div ref={chatWindowRef} id='chat-window' className="h-svh relative app-undragable" style={{
      backgroundColor: '#f9f9f9',
      backgroundImage: `radial-gradient(circle at 1px 1px, rgba(139,125,102,0.15) 1px, transparent 0)`,
      backgroundSize: '50px 50px'
    }}>
      <ChatHeaderComponent />
      <div ref={chatListRef} id='chat-list' className="mt-14 w-full overflow-scroll flex flex-col space-y-2 px-2" style={{ height: `${chatListHeight}px` }}>
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
        {/* just as a padding element */}
        <div className="flex h-20 pt-16 select-none">&nbsp;</div>
      </div>
      <ChatInputArea
        ref={inputAreaRef}
        onSubmit={onSubmit}
        selectedMcpTools={selectedMcpTools}
        setSelectedMcpTools={setSelectedMcpTools}
        mcpTools={mcpTools}
      />
    </div>
  )
})

export default ChatWindowComponentV2
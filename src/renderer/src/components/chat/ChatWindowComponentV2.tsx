import ChatHeaderComponent from "@renderer/components/sys/ChatHeaderComponent"

import { Textarea } from '@renderer/components/ui/textarea'
import { Badge } from "@renderer/components/ui/badge"
import { Button } from '@renderer/components/ui/button'
import { PaperPlaneIcon } from '@radix-ui/react-icons'
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@renderer/components/ui/command'
import { Popover, PopoverTrigger, PopoverContent } from '@radix-ui/react-popover'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider
} from "@renderer/components/ui/tooltip"

import { useChatStore } from '@renderer/store'
import { useChatContext } from '@renderer/context/ChatContext'
import React, { useState, forwardRef, useEffect } from 'react'
import { ChevronsUpDown, Check, SlidersHorizontal, Globe, BadgePercent, CirclePlus, PlaneIcon } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

import { MDXProvider } from '@mdx-js/react'
import {MDXComponents} from 'mdx/types.js'
import ChatAssiatantMessageComp from './ChatAssiatantMessageComp.mdx'
import ChatUserMessageComp from '@renderer/components/mdx/ChatUserMessageComp.mdx'
import chatSubmit from '@renderer/hooks/use-chat-submit'

const ChatWindowComponentV2: React.FC = forwardRef<HTMLDivElement>(() => {
  const { 
      messages,
      currentReqCtrl, 
      readStreamState, setReadStreamState, 
      setProvider, 
      providers, 
      models, 
      selectedModel, 
      setSelectedModel, 
      imageSrcBase64List, setImageSrcBase64List
  } = useChatStore()
  const {setChatContent} = useChatContext()

  const [inputContent, setInputContent] = useState<string>('')
  const [selectModelPopoutState, setSelectModelPopoutState] = useState<boolean>(false)
  const [selectMCPPopoutState, setSelectMCPPopoutState] = useState<boolean>(false)
  const [chatListHeight, setChatListHeight] = useState<number>(0)

  const onSubmit = chatSubmit()
  
  const components: MDXComponents = {
    em(properties) {
      return <i {...properties} />
    }
  }

  const calculateChatListHeight = () => {
    const chatWindow = document.getElementById('chat-window')
    const inputArea = document.getElementById('input-area')
    
    if (chatWindow && inputArea) {
      const chatWindowHeight = chatWindow.offsetHeight
      const inputAreaHeight = inputArea.offsetHeight
      setChatListHeight(chatWindowHeight - inputAreaHeight - 78)
    }
  }

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
    calculateChatListHeight()
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    const chatList = document.getElementById('chat-list')
    if (chatList) {
      chatList.scrollTop = chatList.scrollHeight
    }
  }

  const onSubmitClick = (_) => {
    setChatContent(inputContent)
    onSubmit(inputContent, imageSrcBase64List)

    setInputContent('')
    setImageSrcBase64List([])
    
    // 延迟滚动到底部，确保新消息已经渲染
    setTimeout(() => {
      scrollToBottom()
    }, 100)
  }
  const onTextAreaChange = (e) => {
    setInputContent(e.target.value)
  }
  return (
    <div id='chat-window' className="h-svh relative app-undragable" style={{
      backgroundColor: '#f9f9f9',
      backgroundImage: `radial-gradient(circle at 1px 1px, rgba(139,125,102,0.15) 1px, transparent 0)`,
      backgroundSize: '50px 50px'
    }}>
      <ChatHeaderComponent />
      <div id='chat-list' className="mt-16 mr-2 w-full overflow-scroll flex flex-col space-y-2 px-4" style={{ height: `${chatListHeight}px` }}>
        <MDXProvider components={components}>
          {
            messages.length !== 0 && messages.map((m, index) => m.body.role === 'user' ? 
            (
              <div key={index} className="flex justify-end">
                <div className="border-gray-200 border-[1px] text-gray-700 p-2 rounded-xl">
                  <ChatUserMessageComp content={m.body.content} />
                </div>
              </div>
            )
            : 
            (
              <div key={index} className="flex justify-start">
                <div className="bg-gray-100 pb-1 prose rounded-xl">
                  <ChatAssiatantMessageComp content={m.body.content} reasoning={m.body.reasoning} components={{
                    PlaneIconTo() {
                      return <PlaneIcon></PlaneIcon>
                    },
                    Think() {
                      return m.body.reasoning?.startsWith('<') ? <div>{m.body.reasoning}</div> : <></>
                    }
                  }} />
                </div>
              </div>
            )
          )
          }
        </MDXProvider>
      </div>
      <div id='input-area' className="p-6 rounded-md fixed bottom-10 w-full h-52">
        <div className='rounded-xl flex items-center space-x-2 pl-2 pr-2 mb-2 select-none'>
          <div className="app-undragable">
            <Popover open={selectModelPopoutState} onOpenChange={setSelectModelPopoutState}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={selectModelPopoutState}
                  className="w-auto justify-between flex p-1 rounded-full bg-white/20 backdrop-blur-xl"
                  >
                    <span className="flex flex-grow overflow-x-hidden opacity-70">
                      {selectedModel ? (
                        (() => {
                          const selected = models.find(m => m.value === selectedModel);
                          if (!selected) return null;
                          return selected.type === 'vlm' ? (
                            <span className="flex space-x-2">
                              <span>{selected.value}</span>
                              <i className="ri-eye-line text-green-500"></i>
                            </span>
                          ) : (selected.value);
                        })()) : ("Select Model")}
                    </span>
                    <ChevronsUpDown className="flex opacity-50 pl-1 pr-0.5 w-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full border-[1px] ml-1 rounded-xl">
                <Command className='z-10 rounded-xl bg-white/30 backdrop-blur-xl'>
                  <CommandInput placeholder="Search model" className="h-auto" />
                  <CommandList>
                    {(models.findIndex(fm => fm.enable === true) != -1) && <CommandEmpty>Oops...NotFound</CommandEmpty>}
                    {providers.map((p) => p.models.length > 0 && (
                          <CommandGroup
                              key={p.name}
                              value={p.name}
                              className='scroll-smooth'
                          >
                              <span className="text-xs text-gray-400">{p.name}</span>
                              {
                                  p.models.map((m) => m.enable && (
                                      <CommandItem
                                          key={m.value}
                                          value={m.value}
                                          onSelect={(currentValue) => {
                                              setSelectedModel(currentValue)
                                              const p = providers.findLast(p => p.name == m.provider)!
                                              setProvider(p)
                                              setSelectModelPopoutState(false)
                                          }}
                                      >
                                          {m.value}
                                          {m.type === 'vlm' && <i className="ri-eye-line text-green-500"></i>}
                                          <Check className={cn("ml-auto", selectedModel === m.value ? "opacity-100" : "opacity-0")} />
                                      </CommandItem>
                                  ))
                              }
                          </CommandGroup>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="app-undragable">
            <Popover open={selectMCPPopoutState} onOpenChange={setSelectMCPPopoutState}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={selectMCPPopoutState}
                  className="w-auto justify-between flex p-1 rounded-full bg-white/30 backdrop-blur-xl"
                  >
                    <span className="flex flex-grow overflow-x-hidden opacity-70">
                      {selectedModel ? (
                        (() => {
                          const selected = models.find(m => m.value === selectedModel);
                          if (!selected) return null;
                          return selected.type === 'vlm' ? (
                            <span className="flex space-x-2">
                              <span>{selected.value}</span>
                              <i className="ri-eye-line text-green-500"></i>
                            </span>
                          ) : (selected.value);
                        })()) : ("Mcp Tool")}
                    </span>
                    <SlidersHorizontal className="flex opacity-50 pl-1 pr-0.5 w-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full border-[1px] ml-1 rounded-xl">
                <Command className='z-10 rounded-xl bg-white/30 backdrop-blur-xl'>
                  <CommandInput placeholder="Search tool" className="h-auto" />
                  <CommandList>
                    {(models.findIndex(fm => fm.enable === true) != -1) && <CommandEmpty>Oops...NotFound</CommandEmpty>}
                    {providers.map((p) => p.models.length > 0 && (
                          <CommandGroup
                              key={p.name}
                              value={p.name}
                              className='scroll-smooth'
                          >
                              <span className="text-xs text-gray-400">{p.name}</span>
                              {
                                  p.models.map((m) => m.enable && (
                                      <CommandItem
                                          key={m.value}
                                          value={m.value}
                                          onSelect={(currentValue) => {
                                              setSelectedModel(currentValue)
                                              const p = providers.findLast(p => p.name == m.provider)!
                                              setProvider(p)
                                              setSelectModelPopoutState(false)
                                          }}
                                      >
                                          {m.value}
                                          {m.type === 'vlm' && <i className="ri-eye-line text-green-500"></i>}
                                          <Check className={cn("ml-auto", selectedModel === m.value ? "opacity-100" : "opacity-0")} />
                                      </CommandItem>
                                  ))
                              }
                          </CommandGroup>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className='bg-red-200 flex-grow w-full'></div>
        </div>
        <div className='relative bg-gray-50 h-full rounded-2xl -z-10'>
          <Textarea 
            style={{maxHeight: 'calc(100% - 2rem)'}}
            className="bg-gray-50 focus:bg-white/50 backdrop-blur-3xl text-base p-2 h-full border-b-[0px] rounded-bl-none rounded-br-none
              rounded-t-2xl resize-none pr-12 pb-12 overflow-y-auto" 
            placeholder='Type anything to chat'
            value={inputContent}
            onChange={onTextAreaChange}
            ></Textarea>
          <div className='absolute bottom-0 rounded-b-2xl z-10 w-full bg-[#F9FAFB] p-1 pl-2 flex border-b-[1px] border-l-[1px] border-r-[1px]'>
            <div className='flex-grow flex space-x-2 select-none relative'>
              <TooltipProvider delayDuration={400}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size={'xs'} variant="ghost" className="rounded-full"><CirclePlus className='text-gray-600 flex justify-center border-none hover:text-gray-400'></CirclePlus></Button>
                  </TooltipTrigger>
                  <TooltipContent className="bg-black/30 backdrop-blur-3xl text-gray-100">
                    <p>Upload files or pictures</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider delayDuration={400}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="secondary" className='bg-black/5 backdrop-blur-3xl text-gray-600 hover:bg-blue-100 hover:text-blue-400 flex justify-center rounded-full w-14 h-8'><BadgePercent></BadgePercent></Button>
                  </TooltipTrigger>
                  <TooltipContent className="bg-black/30 backdrop-blur-3xl text-gray-100">
                    <p>Thinking</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider delayDuration={400}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="secondary" className="bg-black/5 backdrop-blur-3xl text-gray-600 hover:bg-blue-100 hover:text-blue-400 flex justify-center rounded-full w-14 h-8"><Globe></Globe></Button>
                  </TooltipTrigger>
                  <TooltipContent className="bg-black/30 backdrop-blur-3xl text-gray-100">
                    <p>Web Search</p>
                  </TooltipContent>
                </Tooltip>
                </TooltipProvider>
              {/* <div><Badge variant="secondary" className='border-[1px] border-gray-200 hover:bg-gray-300 text-blue-600 w-10 flex justify-center'>MCP</Badge></div> */}
              <div onClick={onSubmitClick} className='absolute right-0 bottom-0'><Button variant={'default'} size={'sm'} className='rounded-2xl border-[1px] border-gray-300 hover:bg-gray-600'><PaperPlaneIcon className="-rotate-45 mb-0.5 ml-0.5 w-8" /></Button></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

export default ChatWindowComponentV2
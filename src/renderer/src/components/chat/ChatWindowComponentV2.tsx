import ChatHeaderComponent from "@renderer/components/chat/ChatHeaderComponent"
import ChatImgGalleryComponent from "@renderer/components/chat/ChatImgGalleryComponent"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@renderer/components/ui/accordion"
import { Textarea } from '@renderer/components/ui/textarea'
import { Badge } from "@renderer/components/ui/badge"
import { Button } from '@renderer/components/ui/button'
import { PaperPlaneIcon, CopyIcon, ReloadIcon, Pencil2Icon, StopIcon } from '@radix-ui/react-icons'
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
import { 
  ChevronsUpDown, 
  Check, 
  Globe, 
  BadgePercent, 
  CirclePlus,
  Boxes,
  CornerDownLeft,
  ArrowBigUp
} from 'lucide-react'
import { cn } from '@renderer/lib/utils'

import chatSubmit from '@renderer/hooks/use-chat-submit'

import { SyntaxHighlighterWrapper, CodeCopyWrapper } from '@renderer/components/md/SyntaxHighlighterWrapper'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'

const ChatWindowComponentV2: React.FC = forwardRef<HTMLDivElement>(() => {
  const { 
      messages,
      currentReqCtrl, 
      readStreamState, setReadStreamState,
      webSearchEnable, toggleWebSearch,
      providers,
      setCurrentProviderName,
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
    calculateChatListHeight()
    scrollToBottom()
    // console.log(messages)
  }, [messages])

  useEffect(() => {
    const tools: string[] = []
    for (const [name, cfg] of Object.entries(mcpConfig.mcpServers)) {
      tools.push(name)
    }
    setMcpTools(tools)
  }, [mcpConfig])

  const onSubmit = chatSubmit()

  const calculateChatListHeight = () => {
    const chatWindow = document.getElementById('chat-window')
    const inputArea = document.getElementById('input-area')
    
    if (chatWindow && inputArea) {
      const chatWindowHeight = chatWindow.offsetHeight
      const inputAreaHeight = inputArea.offsetHeight
      setChatListHeight(chatWindowHeight - inputAreaHeight)
    }
  }

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
  const onTextAreaKeyDown = (e) => {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault() // 防止跳到新的一行
      onSubmitClick(e)
    }
  }
  const onTextAreaPaste = (event) => {
    const items = (event.clipboardData || event.originalEvent.clipboardData).items
    let blob = null

    let findImg: boolean = false
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) { // 找到图片类型的数据
            blob = items[i].getAsFile()
            findImg = true
            break
        }
    }
    console.log(`findImg? ${findImg}`)
    if (blob) {
        const reader = new FileReader()
        reader.readAsDataURL(blob) // 以 Data URL 的形式读取文件内容
        reader.onloadend = () => {
            // 设置图片的 src 属性为读取到的数据 URL
            // console.log(reader.result) // base64 格式的图片数据
            setImageSrcBase64List([...imageSrcBase64List, reader.result])
        }
    }
  }
  const onStopClick = (_) => {
    if (currentReqCtrl) {
        currentReqCtrl.abort()
        setReadStreamState(false)
    }
  }
  const onSearchClick = async () => {
    console.log('onSearchClick-click');
    
    // 通过 IPC 调用主进程中的 headless browser search action
    const { success, result } = await window.electron?.ipcRenderer.invoke('headless-web-search-action', {
      action: 'navigate',
      url: '杭州天气'
    })
  }
  const onWebSearchClick = () => {
    toggleWebSearch(!webSearchEnable)
  }
  return (
    <div id='chat-window' className="h-svh relative app-undragable" style={{
      backgroundColor: '#f9f9f9',
      backgroundImage: `radial-gradient(circle at 1px 1px, rgba(139,125,102,0.15) 1px, transparent 0)`,
      backgroundSize: '50px 50px'
    }}>
      <ChatHeaderComponent />
      <div id='chat-list' className="mt-14 w-full overflow-scroll flex flex-col space-y-2 px-2" style={{ height: `${chatListHeight}px` }}>
        {
            messages.length !== 0 && messages.map((m, index) => m.body.role === 'user' ? 
            (
              (
                <div id='use-message' key={index} className={cn("flex justify-end mr-1", index == 0 ? 'mt-2' : '')}>
                  <div className={cn("max-w-[85%] rounded-xl py-3 px-3 bg-blue-50 dark:bg-gray-100")}>
                    {typeof m.body.content !== 'string' ? (
                      <>
                        <div className="">
                          {m.body.content.map((vlmContent: VLMContent, idx) => {
                            if (vlmContent.image_url) {
                              return <img key={idx} src={vlmContent.image_url?.url} onDoubleClick={e => e}></img>
                            } else {
                              return (
                                <ReactMarkdown
                                  key={idx}
                                  remarkPlugins={[remarkGfm]}
                                  skipHtml={false}
                                  className={cn("prose prose-code:text-gray-400 text-base text-blue-gray-600 font-medium max-w-[100%] dark:text-white transition-all duration-400 ease-in-out")}
                                  components={{
                                    code(props) {
                                      const { children, className, node, ...rest } = props
                                      const match = /language-(\w+)/.exec(className || '')
                                      return match ? (
                                        <CodeCopyWrapper code={String(children).replace(/\n$/, '')}>
                                          <SyntaxHighlighterWrapper
                                          children={String(children).replace(/\n$/, '')}
                                          language={match[1]}
                                          />
                                        </CodeCopyWrapper>
                                      ) : (
                                        <code {...rest} className={className}>
                                          {children}
                                        </code>
                                      )
                                    }
                                  }}
                                >
                                  {vlmContent.text}
                                </ReactMarkdown>
                              )
                            }
                          })}
                        </div>
                      </>
                    ) : (
                      <ReactMarkdown
                        key={index}
                        remarkPlugins={[remarkGfm]}
                        skipHtml={false}
                        className={cn("prose prose-code:text-gray-400 text-base text-blue-gray-600 dark:text-gray-700 font-medium max-w-[100%] transition-all duration-400 ease-in-out")}
                        components={{
                          code(props) {
                            const { children, className, node, ...rest } = props
                            const match = /language-(\w+)/.exec(className || '')
                            return match ? (
                              <CodeCopyWrapper code={String(children).replace(/\n$/, '')}>
                                <SyntaxHighlighterWrapper
                                children={String(children).replace(/\n$/, '')}
                                language={match[1]}
                                />
                              </CodeCopyWrapper>
                            ) : (
                              <code {...rest} className={className}>
                                {children}
                              </code>
                            )
                          }
                        }}
                      >
                        {m.body.content as string}
                      </ReactMarkdown>
                    )}
                  </div>
              </div>
              )
            )
            : 
            (<div id='assistant-message' key={index} className={cn("flex justify-start flex-col pb-0.5", index == 0 ? 'mt-2' : '')}>
                <div className="rounded-xl bg-gray-50 dark:bg-gray-900 overflow-y-scroll">
                    {
                      m.body.reasoning && 
                      (
                        <Accordion defaultValue={'reasoning-' + index} type="single" collapsible className='pl-0.5 pr-0.5 rounded-xl'>
                          <AccordionItem value={'reasoning-' + index}>
                            <AccordionTrigger className='text-sm h-10'><Badge variant={'secondary'} className="text-gray-600 bg-blue-gray-100 hover:bg-blue-gray-200 space-x-1"><BadgePercent className="w-4" /><span>Thinking</span></Badge></AccordionTrigger>
                            <AccordionContent className="bg-blue-gray-100 p-1 border-none rounded-xl">
                              <div className='text-blue-gray-500 pb-2 pl-1 pr-1 border-none'>{(m.body.reasoning as string)}</div>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      )
                    }
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeRaw]}
                      remarkRehypeOptions={{ passThrough: ['link'] }}
                      className="prose px-2 py-2 text-base text-blue-gray-600 dark:prose-invert prose-hr:mt-4 prose-hr:mb-4 prose-code:text-gray-400 dark:prose-code:text-gray-100 dark:text-slate-300 font-medium max-w-[100%] transition-all duration-400 ease-in-out"
                      components={{
                        code(props) {
                          const { children, className, node, ...rest } = props
                          const match = /language-(\w+)/.exec(className || '')
                          return match ? (
                            <CodeCopyWrapper code={String(children).replace(/\n$/, '')}>
                              <SyntaxHighlighterWrapper
                              children={String(children).replace(/\n$/, '')}
                              language={match[1]}
                              />
                            </CodeCopyWrapper>
                          ) : (
                            <code {...rest} className={className}>
                              {children}
                            </code>
                          )
                        }
                      }}
                    >
                      {m.body.content as string}
                    </ReactMarkdown>
                </div>
                <div className="pl-2 space-x-1 flex text-gray-500">
                  <div className="hover:bg-gray-200 w-6 h-6 p-1 rounded-full flex justify-center items-center"><CopyIcon></CopyIcon></div>
                  {
                    // only the latest messgae can be regenerate
                    index === messages.length - 1 && (
                      <div className="hover:bg-gray-200 w-6 h-6 p-1 rounded-full flex justify-center items-center"><ReloadIcon></ReloadIcon></div>
                    )
                  }
                  <div className="hover:bg-gray-200 w-6 h-6 p-1 rounded-full flex justify-center items-center"><Pencil2Icon></Pencil2Icon></div>
                </div>
              </div>
            )
          )
        }
        <div><Button onClick={(_) => onSearchClick()}>ppClick</Button></div>
        {/* just as a padding element */}
        <div className="flex h-20 pt-16 select-none">&nbsp;</div>
      </div>
      <div id='input-area' className={cn('p-6 pt-0 rounded-md fixed w-full h-52', imageSrcBase64List.length !== 0 ? 'bottom-36' : 'bottom-8')}>
        <div className={cn(imageSrcBase64List.length !== 0 ? 'h-28' : 'h-0')}>
            <ChatImgGalleryComponent></ChatImgGalleryComponent>
        </div>
        <div className='rounded-xl flex items-center space-x-2 pl-2 pr-2 mb-2 select-none'>
          <div className="app-undragable">
            <Popover open={selectModelPopoutState} onOpenChange={setSelectModelPopoutState}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={selectModelPopoutState}
                  className="min-w-20 w-auto flex justify-between p-1 rounded-full bg-white/20 hover:bg-black/5 text-gray-700 backdrop-blur-xl"
                  >
                    <span className="flex flex-grow justify-center overflow-x-hidden opacity-70">
                      {selectedModel ? (
                        (() => {
                          return selectedModel.type === 'vlm' ? (
                            <span className="flex space-x-2">
                              <span>{selectedModel.value}</span>
                              <i className="ri-eye-line text-green-500"></i>
                            </span>
                          ) : <span>{selectedModel.value}</span>
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
                                        key={m.provider + '/' +m.value}
                                        value={m.value}
                                        onSelect={(selectedModelValue) => {
                                          setSelectedModel(m)
                                          const p = providers.findLast(p => p.name == m.provider)!
                                          setCurrentProviderName(p.name)
                                          setSelectModelPopoutState(false)
                                        }}
                                      >
                                          {m.name}
                                          {m.type === 'vlm' && <i className="ri-eye-line text-green-500"></i>}
                                          {(selectedModel && selectedModel.value === m.value && selectedModel.provider === p.name) && <Check className={cn("ml-auto")} />}
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
                  className="min-w-20 w-auto flex justify-between p-1 rounded-full bg-white/20 hover:bg-black/5 text-gray-700 backdrop-blur-xl space-x-1"
                  >
                    <span className="flex flex-grow justify-center overflow-x-hidden opacity-70">
                      {selectedMcpTools.length === 0 ? 'Mcp Tool' : selectedMcpTools[0] }
                    </span>
                    {selectedMcpTools.length > 1 && <Badge className="w-[5px] justify-center bg-blue-gray-200 hover:bg-blue-gray-200 text-blue-gray-500 backdrop-blur-xl">+{selectedMcpTools.length - 1}</Badge>}
                    <Boxes className="flex opacity-50 pl-1 pr-0.5 w-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full border-[1px] ml-1 rounded-xl">
                <Command className='z-10 rounded-xl bg-white/30 backdrop-blur-xl'>
                  <CommandInput placeholder="Search tool" className="h-auto" />
                  <CommandList>
                  <CommandGroup
                    className='scroll-smooth'
                    >
                      {
                        mcpTools.map((mcpToolName) =>  (
                            <CommandItem
                              key={mcpToolName}
                              value={mcpToolName}
                              onSelect={(selectVal) => {
                                if (selectedMcpTools.includes(selectVal)) {
                                  setSelectedMcpTools(selectedMcpTools.filter(mcp => mcp !== selectVal))
                                } else {
                                  setSelectedMcpTools([...selectedMcpTools, selectVal])
                                }
                                setSelectMCPPopoutState(false)
                              }}
                            >
                              {mcpToolName}
                              {(selectedMcpTools && selectedMcpTools.includes(mcpToolName)) && <Check className={cn("ml-auto")} />}
                          </CommandItem>
                        ))
                      }
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className='flex-grow w-full'></div>
        </div>
        <div className='relative bg-gray-50 h-full rounded-2xl -z-10 flex flex-col'>
          <Textarea 
            style={{maxHeight: 'calc(100% - 2rem)'}}
            className="bg-white/5 focus:bg-white/50 backdrop-blur-3xl text-base p-2 border-b-[0px] rounded-bl-none rounded-br-none
              rounded-t-2xl resize-none pr-12 pb-12 overflow-y-auto flex-grow" 
            placeholder='Type anything to chat'
            value={inputContent}
            onChange={onTextAreaChange}
            onKeyDown={onTextAreaKeyDown}
            onPaste={onTextAreaPaste}
            ></Textarea>
          <div className="rounded-b-2xl z-10 w-full bg-[#F9FAFB] p-1 pl-2 flex border-b-[1px] border-l-[1px] border-r-[1px] flex-none h-10">
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
                    <Button variant="secondary" 
                      className={
                        cn("bg-black/5 backdrop-blur-3xl text-gray-600 hover:bg-blue-100 hover:text-blue-400 flex justify-center rounded-full w-14 h-8",
                        webSearchEnable ? 'bg-blue-100 text-blue-400' : ''
                        )} 
                      onClick={onWebSearchClick}><Globe></Globe>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="bg-black/30 backdrop-blur-3xl text-gray-100">
                    <p>Web Search</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <div onClick={onSubmitClick} className='absolute right-0 bottom-0'>
                  {!readStreamState 
                    ? (
                      <Button variant={'default'} size={'sm'} className='rounded-full border-[1px] border-gray-300 hover:bg-gray-600'>
                        <PaperPlaneIcon className="-rotate-45 mb-0.5 ml-0.5 w-8" />
                        <sub className="text-gray-400 flex"><ArrowBigUp className="w-3" /><CornerDownLeft className="w-3" /></sub>
                      </Button>
                    )
                    : <Button variant={'destructive'} size={'sm'} className={cn('rounded-full border-[1px] hover:bg-red-400 animate-pulse transition-transform duration-800')} onClick={onStopClick}><StopIcon />&nbsp;Stop</Button>
                  }
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

export default ChatWindowComponentV2
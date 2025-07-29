import React, { useState, useCallback, useEffect } from 'react'
import { Textarea } from '@renderer/components/ui/textarea'
import { Badge } from "@renderer/components/ui/badge"
import { Button } from '@renderer/components/ui/button'
import { PaperPlaneIcon, StopIcon } from '@radix-ui/react-icons'
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@renderer/components/ui/command'
import { Popover, PopoverTrigger, PopoverContent } from '@radix-ui/react-popover'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider
} from "@renderer/components/ui/tooltip"
import { 
  ChevronsUpDown, 
  Check, 
  Globe, 
  BadgePercent,
  BadgePlus,
  CirclePlus,
  Boxes,
  CornerDownLeft,
  ArrowBigUp,
  Atom,
  Settings2,
  LoaderCircle
} from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import ChatImgGalleryComponent from '@renderer/components/chat/ChatImgGalleryComponent'
import { useChatStore } from '@renderer/store'
import { useChatContext } from '@renderer/context/ChatContext'
import chatSubmit from '@renderer/hooks/use-chat-submit'
import { Label } from '@renderer/components/ui/label'
import { Input } from '@renderer/components/ui/input'
import { toast } from 'sonner'

interface ChatInputAreaProps {
  onSubmit: () => void
}
const availableMcpTools = new Map()

const ChatInputArea = React.forwardRef<HTMLDivElement, ChatInputAreaProps>(({
  onSubmit,
}, ref) => {
  const {setChatContent} = useChatContext()
  // Get state and actions from store
  const {
    setMessages,
    imageSrcBase64List,
    setImageSrcBase64List,
    currentReqCtrl, 
    readStreamState, setReadStreamState,
    webSearchEnable, toggleWebSearch,
    webSearchProcessing, setWebSearchProcessState,
    artifacts, toggleArtifacts,
    providers,
    models,
    selectedModel,
    setSelectedModel,
    setCurrentProviderName
  } = useChatStore()
  const {setChatTitle, setChatUuid, chatId, setChatId} = useChatContext()
  const [inputContent, setInputContent] = useState<string>('')
  const [selectModelPopoutState, setSelectModelPopoutState] = useState<boolean>(false)
  const [selectMCPPopoutState, setSelectMCPPopoutState] = useState<boolean>(false)
  const [selectedMcpServerNames, setSelectedMcpServerNames] = useState<string[]>([])
  const [mcpServerConfig, setMcpServerConfig] = useState({
    "mcpServers": {
      "filesystem": {
        "command": "npx",
        "args": [
          "-y",
          "@modelcontextprotocol/server-filesystem",
          "/Users/gnl/workspace/code/-i-ati",
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
  const [connectingMcpServers, setConnectingMcpServers] = useState<string[]>([])
  const useSubmit = chatSubmit()
  const onSubmitClick = useCallback((_) => {
    useSubmit(inputContent, imageSrcBase64List, ...availableMcpTools.values().toArray())

    onSubmit() // for chat-window scroll to the end

    setInputContent('')
    setImageSrcBase64List([])
  }, [inputContent, imageSrcBase64List, setChatContent, useSubmit])

  const onStopClick = useCallback((_) => {
    if (currentReqCtrl) {
        currentReqCtrl.abort()
        setReadStreamState(false)
    }
    if (webSearchProcessing) {
      setWebSearchProcessState(false)
    }
  }, [currentReqCtrl, setReadStreamState, webSearchProcessing, setWebSearchProcessState])
  const onWebSearchClick = useCallback(() => {
    toggleWebSearch(!webSearchEnable)
  }, [toggleWebSearch, webSearchEnable])
  const onArtifactsClick = useCallback(() => {
    toggleArtifacts(!artifacts)
  }, [artifacts, toggleArtifacts])
  const onTextAreaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputContent(e.target.value)
  }, [setInputContent])

  const onTextAreaKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault()
      onSubmitClick(e)
    }
  }, [onSubmitClick])

  const onTextAreaPaste = useCallback((event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = (event.clipboardData || (event as any).originalEvent.clipboardData).items
    let blob: File | null = null

    let findImg: boolean = false
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            blob = items[i].getAsFile()
            findImg = true
            break
        }
    }
    // console.log(`findImg? ${findImg}`)
    if (blob) {
        const reader = new FileReader()
        reader.readAsDataURL(blob)
        reader.onloadend = () => {
            setImageSrcBase64List([...imageSrcBase64List, reader.result as string])
        }
    }
  }, [imageSrcBase64List, setImageSrcBase64List])

  const startNewChat = () => {
    if (chatId) {
      setChatId(undefined)
      setChatUuid(undefined)
      setChatTitle('NewChat')
      setMessages([])
  
      toggleArtifacts(false)
      toggleWebSearch(false)
    }
  }
  const onMcpToolSelected = async (mcpServerName, mcpServerConfig) => {
    console.log('mcp-server-config', mcpServerName, mcpServerConfig)
    let isEnableMcpServer = false
    let sMcpTools
    if (selectedMcpServerNames.includes(mcpServerName)) {
      sMcpTools = selectedMcpServerNames.filter(mcp => mcp !== mcpServerName)
    } else {
      isEnableMcpServer = true
      sMcpTools = [...selectedMcpServerNames, mcpServerName]
    }
    if (isEnableMcpServer) {
      setConnectingMcpServers([...connectingMcpServers, mcpServerName])
      const {result, tools, msg} = await window.electron?.ipcRenderer.invoke('mcp-connect', {
        name: mcpServerName,
        command: mcpServerConfig.command,
        args: mcpServerConfig.args
      })
      setConnectingMcpServers(connectingMcpServers.filter(m => m !== mcpServerName))
      if (result) {
        setSelectedMcpServerNames(sMcpTools)
        availableMcpTools.set(mcpServerName, tools)
        console.log('connected availableMcpTools', availableMcpTools)
        toast.success(msg)
      } else {
        toast.error(msg)
      }
    } else {
      setSelectedMcpServerNames(sMcpTools)
      availableMcpTools.delete(mcpServerName)
      console.log('disconnected availableMcpTools', availableMcpTools)
      await window.electron?.ipcRenderer.invoke('mcp-disconnect', {
        name: mcpServerName
      })
      toast.warning(`Disconnected mcp-server '${mcpServerName}'`)
    }
    // setSelectMCPPopoutState(false)
  }

  return (
    <div ref={ref} id='input-area' className={cn('p-6 pt-0 rounded-md fixed w-full h-52', imageSrcBase64List.length !== 0 ? 'bottom-36' : 'bottom-8')}>
      <div className={cn(imageSrcBase64List.length !== 0 ? 'h-28' : 'h-0')}>
          <ChatImgGalleryComponent></ChatImgGalleryComponent>
      </div>
      <div className='rounded-xl flex items-center space-x-2 pr-2 mb-2 select-none'>
        {/* <div className="app-undragable">
          <Button variant={'ghost'} className='rounded-full shadow bg-white/20 hover:bg-black/5 backdrop-blur-xl text-gray-500'>new-chat</Button>
        </div> */}
        <div className="app-undragable">
          <Popover open={selectModelPopoutState} onOpenChange={setSelectModelPopoutState}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={selectModelPopoutState}
                className="min-w-20 w-auto flex justify-between p-1 rounded-full bg-white/20 hover:bg-black/5 text-gray-700 backdrop-blur-xl border-none shadow"
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
            <PopoverContent className="w-full shadow ml-1 rounded-xl">
              <Command className='z-10 rounded-xl bg-white/30 backdrop-blur-xl'>
                <CommandInput placeholder="Search model" className="h-auto" />
                <CommandList>
                  {(models.findIndex(fm => fm.enable === true) != -1) && <CommandEmpty>Oops...NotFound</CommandEmpty>}
                  {providers.map((p) => p.models.length > 0 && p.models.findIndex(m => m.enable) !== -1 && (
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
                                      value={m.provider + '/' +m.value}
                                      onSelect={(_) => {
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
                className="min-w-20 w-auto flex justify-between p-1 rounded-full bg-white/20 hover:bg-black/5 text-gray-700 backdrop-blur-xl space-x-1 border-none shadow"
                >
                  <span className="flex flex-grow justify-center overflow-x-hidden opacity-70">
                    {selectedMcpServerNames.length === 0 ? 'Mcp Tool' : selectedMcpServerNames[0] }
                  </span>
                  {selectedMcpServerNames.length > 1 && <Badge className="w-[5px] justify-center bg-blue-gray-200 hover:bg-blue-gray-200 text-blue-gray-500 backdrop-blur-xl">+{selectedMcpServerNames.length - 1}</Badge>}
                  <Boxes className="flex opacity-50 pl-1 pr-0.5 w-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full shadow ml-1 rounded-xl">
              <Command className='z-10 rounded-xl bg-white/30 backdrop-blur-xl'>
                <CommandInput placeholder="Search tool" className="h-auto" />
                <CommandList>
                <CommandGroup
                  className='scroll-smooth'
                  >
                    {
                      mcpServerConfig && mcpServerConfig.mcpServers && Object.entries(mcpServerConfig.mcpServers).map(([mcpName, mcpCfg], idx) =>  (
                          <CommandItem
                            key={idx}
                            value={mcpName}
                            onSelect={(selectVal) => {
                              onMcpToolSelected(selectVal, mcpCfg)
                            }}
                          >
                            {mcpName}
                            {connectingMcpServers.includes(mcpName) && <LoaderCircle className='ml-auto animate-spin' />}
                            {(selectedMcpServerNames && selectedMcpServerNames.includes(mcpName)) && <Check className={cn("ml-auto")} />}
                        </CommandItem>
                      ))
                    }
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <div className='flex-grow w-full'>
          <div className='flex justify-end w-auto'>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant={'ghost'} 
                  className=
                    "flex p-1 rounded-full bg-white/20 hover:bg-black/5 text-gray-500 hover:text-gray-700 backdrop-blur-xl border-none shadow"
                  >
                  <span>Chat Settings</span><Settings2 className="h-4 w-4 ml-1" />
                </Button>
              </PopoverTrigger>
              <PopoverContent>
                <div className="grid gap-4 mr-2 bg-white/30 backdrop-blur-3xl border-[1px] border-gray-300 rounded-xl p-2 text-gray-700">
                  <div className="space-y-2">
                    <h4 className="leading-none font-medium text-gray-800">Chat Settings</h4>
                  </div>
                  <div className="grid gap-2">
                    <div className="grid grid-cols-3 items-center gap-4">
                      <Label htmlFor="temperature">Temperature</Label>
                      <Input
                        id="temperature"
                        defaultValue="0.7"
                        className="col-span-2 h-8"
                      />
                    </div>
                    <div className="grid grid-cols-3 items-center gap-4">
                      <Label htmlFor="topk">TopK</Label>
                      <Input
                        id="topk"
                        defaultValue="0.7"
                        className="col-span-2 h-8"
                      />
                    </div>
                    <div className="grid grid-cols-3 items-center gap-4">
                      <Label htmlFor="topp">TopP</Label>
                      <Input
                        id="topp"
                        defaultValue="0.7"
                        className="col-span-2 h-8"
                      />
                    </div>
                    <div className="grid grid-cols-3 items-center gap-4">
                      <Label htmlFor="maxTokens">MaxTokens</Label>
                      <Input
                        id="maxTokens"
                        defaultValue="4096"
                        className="col-span-2 h-8"
                      />
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
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
          <div className='flex-grow flex items-center space-x-2 select-none relative'>
            <TooltipProvider delayDuration={400}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size={'xs'} variant="ghost" className="rounded-full" onClick={startNewChat}>
                    <BadgePlus className='text-gray-600 flex justify-center border-none hover:text-gray-400'></BadgePlus>
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-black/30 backdrop-blur-3xl text-gray-100">
                  <p>New Chat</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider delayDuration={400}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="secondary" 
                    className={
                      cn('bg-black/5 backdrop-blur-3xl text-gray-600 hover:bg-black/5 flex justify-center rounded-full w-12 h-6',
                        artifacts ? 'bg-blue-100 text-blue-400 hover:bg-blue-100' : 'hover:text-black/90'
                      )}
                    onClick={onArtifactsClick}
                    >
                      <Atom></Atom>
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-black/30 backdrop-blur-3xl text-gray-100">
                  <p>Artifacts</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider delayDuration={400}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="secondary" 
                    className={
                      cn("bg-black/5 backdrop-blur-3xl text-gray-600 hover:bg-black/5 flex justify-center rounded-full w-12 h-6",
                      webSearchEnable ? 'bg-blue-100 text-blue-400 hover:bg-blue-100' : 'hover:text-black/90'
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
  )
})

export default ChatInputArea
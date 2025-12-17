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
  BadgePlus,
  Boxes,
  CornerDownLeft,
  ArrowBigUp,
  Settings2,
  LoaderCircle
} from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import ChatImgGalleryComponent from '@renderer/components/chat/ChatImgGalleryComponent'
import { useChatStore } from '@renderer/store'
import { useChatContext } from '@renderer/context/ChatContext'
import useChatSubmit from '@renderer/hooks/use-chat-submit'
import { Label } from '@renderer/components/ui/label'
import { Input } from '@renderer/components/ui/input'
import { Slider } from "@renderer/components/ui/slider"
import { toast } from 'sonner'
import { embeddedToolsRegistry, type ToolDefinition } from "@tools/registry"

interface ChatInputAreaProps {
  onMessagesUpdate: () => void
}
const availableMcpTools = new Map()

const ChatInputArea = React.forwardRef<HTMLDivElement, ChatInputAreaProps>(({
  onMessagesUpdate,
}, ref) => {
  const {setChatContent} = useChatContext()
  const {
    setMessages,
    imageSrcBase64List,
    setImageSrcBase64List,
    currentReqCtrl,
    readStreamState,
    webSearchEnable, toggleWebSearch,
    artifacts, toggleArtifacts,
    providers,
    models,
    selectedModel,
    setSelectedModel,
    setCurrentProviderName,
    mcpServerConfig,
  } = useChatStore()
  useEffect(() => {
    if (models && models.length === 1) {
      setSelectedModel(models[0])
    }
  }, [models])
  const {setChatTitle, setChatUuid, setChatId} = useChatContext()
  const [inputContent, setInputContent] = useState<string>('')
  const [selectModelPopoutState, setSelectModelPopoutState] = useState<boolean>(false)
  const [selectMCPPopoutState, setSelectMCPPopoutState] = useState<boolean>(false)
  const [selectedMcpServerNames, setSelectedMcpServerNames] = useState<string[]>([])

  const [connectingMcpServers, setConnectingMcpServers] = useState<string[]>([])
  const [chatTemperature, setChatTemperature] = useState<number[]>([1])
  const [chatTopP, setChatTopP] = useState<number[]>([1])
  const [currentSystemPrompt, setCurrentSystemPrompt] = useState<string>('')
  const handleChatSubmit = useChatSubmit()
  const handleChatSubmitCallback = useCallback((text, img, options) => {
    handleChatSubmit(text, img, options)
  }, [handleChatSubmit])
  const onSubmitClick = useCallback((_) => {
    if(!inputContent) {
      return
    }
    if (!selectedModel) {
      toast.warning('Please select one model')
      return
    }
    onMessagesUpdate() // for chat-window scroll to the end
    const tools = Array.from(availableMcpTools.values()).flatMap(i => i)
    if (webSearchEnable) {
      const f: ToolDefinition = embeddedToolsRegistry.getTool('web_search')
      // console.log('web_search', f.function)
      tools.push({
        ...f.function
      })
    }
    handleChatSubmitCallback(inputContent, imageSrcBase64List, {tools: tools, prompt: currentSystemPrompt})
    setInputContent('')
    setImageSrcBase64List([])
  }, [inputContent, imageSrcBase64List, setChatContent, handleChatSubmit])

  const onStopClick = () => {
    console.log('[onStopClick] Triggered, currentReqCtrl:', currentReqCtrl)

    if (!currentReqCtrl) {
      // console.warn('[onStopClick] No active request to stop')
      // toast.warning('No active request')
      return
    }

    // Only call abort - state cleanup will be handled by the catch block in use-chat-submit
    try {
      // console.log('[onStopClick] Calling abort()...')
      currentReqCtrl.abort()
      // toast.warning('Stopping request...')
    } catch (error) {
      // console.error('[onStopClick] Error calling abort():', error)
      toast.error('Failed to stop request')
    }
  }
  const onWebSearchClick = useCallback(() => {
    toggleWebSearch(!webSearchEnable)
  }, [toggleWebSearch, webSearchEnable])
  // const onArtifactsClick = useCallback(() => {
  //   toggleArtifacts(!artifacts)
  // }, [artifacts, toggleArtifacts])
  const onTextAreaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputContent(e.target.value)
  }, [setInputContent])

  const onTextAreaKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault()
      if (!inputContent) {
        toast.error('Input text content is required')
        return
      }
      if (!selectedModel) {
        toast.error('Please select a model')
        return
      }
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
    setChatId(undefined)
    setChatUuid(undefined)
    setChatTitle('NewChat')
    setMessages([])
    setCurrentSystemPrompt('')

    toggleArtifacts(false)
    toggleWebSearch(false)
  }
  const onMcpToolSelected = async (serverName, serverConfig) => {
    console.log('mcp-server-config', serverName, serverConfig)
    if (!selectedMcpServerNames.includes(serverName)) {
      setConnectingMcpServers([...connectingMcpServers, serverName])
      
      const {result, tools, msg} = await window.electron?.ipcRenderer.invoke('mcp-connect', {
        name: serverName,
        ...serverConfig
      })
      setConnectingMcpServers(connectingMcpServers.filter(m => m !== serverName))
      if (result) {
        setSelectedMcpServerNames([...selectedMcpServerNames, serverName])
        availableMcpTools.set(serverName, tools)
        toast.success(msg)
      } else {
        toast.error(msg)
      }
    } else {
      setSelectedMcpServerNames(selectedMcpServerNames.filter(item => item != serverName))
      availableMcpTools.delete(serverName)
      await window.electron?.ipcRenderer.invoke('mcp-disconnect', {
        name: serverName
      })
      toast.warning(`Disconnected mcp-server '${serverName}'`)
    }
  }
  const onChatTopPChange = (val) => {
    setChatTopP([val])
  }
  const onChatTemperatureChange = (val) => {
    setChatTemperature([val])
  }

  return (
    <div ref={ref} id='input-area' className={cn('rounded-md fixed w-full h-52', imageSrcBase64List.length !== 0 ? 'bottom-36' : 'bottom-8')}>
      <div className={cn(imageSrcBase64List.length !== 0 ? 'h-28' : 'h-0')}>
          <ChatImgGalleryComponent />
      </div>
      <div className='rounded-xl flex items-center space-x-2 mb-1 select-none px-4'>
        <div id="modelSelector" className="app-undragable">
          <Popover open={selectModelPopoutState} onOpenChange={setSelectModelPopoutState}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={selectModelPopoutState}
                className="h-8 min-w-20 w-auto flex justify-between p-1 rounded-2xl bg-gray-100 hover:bg-black/5 text-gray-700 backdrop-blur-xl border-none shadow-sm focus-visible:ring-0 focus-visible:ring-offset-0"
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
            <PopoverContent
              className="w-full shadow-lg ml-1 rounded-xl overflow-hidden border border-gray-200/50 bg-white"
              sideOffset={8}
              align="start"
            >
              <Command className='rounded-xl bg-white'>
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
        <div id="mcpSelector" className="app-undragable">
          <Popover open={selectMCPPopoutState} onOpenChange={setSelectMCPPopoutState}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={selectMCPPopoutState}
                className="h-8 min-w-20 w-auto flex justify-between p-1 rounded-2xl bg-gray-100 hover:bg-black/5 text-gray-700 backdrop-blur-xl space-x-1 border-none shadow-sm focus-visible:ring-0 focus-visible:ring-offset-0"
                >
                  <span className="flex flex-grow justify-center overflow-x-hidden opacity-70">
                    {selectedMcpServerNames.length === 0 ? 'MCP Tools' : selectedMcpServerNames[0] }
                  </span>
                  {selectedMcpServerNames.length > 1 && <Badge className="w-[5px] justify-center bg-blue-gray-200 hover:bg-blue-gray-200 text-blue-gray-500 backdrop-blur-xl">+{selectedMcpServerNames.length - 1}</Badge>}
                  <Boxes className="flex opacity-50 pl-1 pr-0.5 w-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-full shadow-lg ml-1 rounded-xl overflow-hidden border border-gray-200/50 bg-white"
              sideOffset={8}
              align="start"
            >
              <Command className='rounded-xl bg-white'>
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
        <div id="customPanel" className='flex-grow w-full'>
          <div className='flex justify-end w-auto'>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant={'ghost'}
                  className=
                    "h-8 flex p-1 rounded-2xl bg-gray-100 hover:bg-black/5 text-gray-500 hover:text-gray-600 backdrop-blur-xl border-none shadow-sm focus-visible:ring-0 focus-visible:ring-offset-0"
                  >
                  <span>Custom</span><Settings2 className="h-4 w-4 ml-1" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="overflow-hidden"
                sideOffset={8}
                align="end"
              >
                <div className="grid gap-4 mr-2 bg-white border-[1px] border-gray-200 rounded-xl p-2 text-gray-700 shadow-lg">
                  <div className="space-y-2 flex justify-evenly">
                    <p className="flex justify-between w-full">
                      <span className='leading-none font-medium text-gray-800'>Chat Settings</span>
                      <Badge variant={'outline'} className='text-xs text-gray-600 hover:bg-gray-200'>Save as Assiatant</Badge>
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <div className="grid grid-cols-3 items-center gap-4">
                      <Label htmlFor="temperature">Temperature</Label>
                      <div id="slider-topp" className="flex items-center space-x-1 col-span-2">
                        <Slider id="temperature" value={chatTemperature} min={0} max={1} step={0.1} onValueChange={value => onChatTemperatureChange(value)} />
                        <Badge variant={'outline'}>{chatTemperature}</Badge>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 items-center gap-4 text-gray-600">
                      <Label htmlFor="topp">TopP</Label>
                      <div id="slider-topp" className="flex items-center space-x-1 col-span-2">
                        <Slider id="topp" value={chatTopP} min={0} max={1} step={0.1} onValueChange={value => onChatTopPChange(value)} />
                        <Badge variant={'outline'}>{chatTopP}</Badge>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 items-center gap-4">
                      <Label htmlFor="maxCompletionTokens">MaxTokens</Label>
                      <Input
                        id="maxCompletionTokens"
                        defaultValue="4096"
                        className="focus-visible:ring-transparent focus-visible:ring-offset-0 col-span-2 h-8"
                      />
                    </div>
                    <div className="grid grid-cols-3 items-center gap-4">
                      <Label htmlFor="systemPrompt">Prompt</Label>
                      <Textarea
                        id="systemPrompt"
                        value={currentSystemPrompt}
                        placeholder='Input your custom system prmopt here'
                        className="focus-visible:ring-transparent focus-visible:ring-offset-0 col-span-2 h-8"
                        onChange={e => setCurrentSystemPrompt(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>
      <div className='relative h-full -z-10 flex flex-col pb-3 px-4'>
        <Textarea
          style={{maxHeight: 'calc(100% - 2rem)'}}
          className="bg-gray-50 focus:bg-white/50 backdrop-blur-3xl text-sm p-2 border-b-[0px] rounded-bl-none rounded-br-none
            rounded-t-2xl resize-none pr-12 pb-12 overflow-y-auto flex-grow font-mono typewriter-cursor text-gray-700"
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
                    <BadgePlus className='w-5 text-gray-600 flex justify-center border-none hover:text-gray-400'></BadgePlus>
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
                  <div className={cn('px-2 py-0.5 rounded-2xl', webSearchEnable ? 'bg-blue-200' : 'hover:bg-gray-100')}>
                    <Globe
                      className={
                        cn("backdrop-blur-3xl text-gray-600 flex justify-center w-5",
                        webSearchEnable ? 'text-blue-400' : 'hover:text-gray-400'
                        )}
                      onClick={onWebSearchClick}>
                    </Globe>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="bg-black/30 backdrop-blur-3xl text-gray-100">
                  <p>Web Search</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div className='absolute right-0 bottom-0'>
                {!readStreamState 
                  ? (
                    <Button onClick={onSubmitClick} variant={'default'} size={'sm'} className='rounded-full border-[1px] border-gray-300 hover:bg-gray-600'>
                      <PaperPlaneIcon className="-rotate-45 mb-0.5 ml-0.5 w-8" />
                      <sub className="text-gray-400 flex"><ArrowBigUp className="w-3" /><CornerDownLeft className="w-3" /></sub>
                    </Button>
                  )
                  : <Button variant={'destructive'} size={'sm'} 
                      className={cn('rounded-full border-[1px] hover:bg-red-400 animate-pulse transition-transform duration-800')} 
                      onClick={onStopClick}>
                        <StopIcon />&nbsp;Stop
                    </Button>
                }
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

export default ChatInputArea
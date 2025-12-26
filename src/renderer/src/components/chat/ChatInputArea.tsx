import { PaperPlaneIcon, StopIcon, TokensIcon } from '@radix-ui/react-icons'
import ChatImgGalleryComponent from '@renderer/components/chat/ChatImgGalleryComponent'
import { Badge } from "@renderer/components/ui/badge"
import { Button } from '@renderer/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@renderer/components/ui/command'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { Slider } from "@renderer/components/ui/slider"
import { Textarea } from '@renderer/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@renderer/components/ui/tooltip"
import { useChatContext } from '@renderer/context/ChatContext'
import useChatSubmit from '@renderer/hooks/useChatSubmit'
import { invokeMcpConnect, invokeMcpDisconnect } from '@renderer/invoker/ipcInvoker'
import { cn } from '@renderer/lib/utils'
import { useChatStore } from '@renderer/store'
import { useAppConfigStore } from '@renderer/store/appConfig'
import { embeddedToolsRegistry } from "@tools/registry"
import {
  ArrowBigUp,
  BadgePlus,
  Check,
  ChevronsUpDown,
  CornerDownLeft,
  LoaderCircle,
  Package,
  Plug
} from 'lucide-react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CustomCaretOverlay, CustomCaretRef } from './CustomCaretOverlay'

import anthropicIcon from '@renderer/assets/provider-icons/anthropic.svg'
import deepseekIcon from '@renderer/assets/provider-icons/deepseek.svg'
import groqIcon from '@renderer/assets/provider-icons/groq.svg'
import moonshotIcon from '@renderer/assets/provider-icons/moonshot.svg'
import ollamaIcon from '@renderer/assets/provider-icons/ollama.svg'
import openaiIcon from '@renderer/assets/provider-icons/openai.svg'
import openrouterIcon from '@renderer/assets/provider-icons/openrouter.svg'
import robotIcon from '@renderer/assets/provider-icons/robot-2-line.svg'
import siliconcloudIcon from '@renderer/assets/provider-icons/siliconcloud.svg'

interface ChatInputAreaProps {
  onMessagesUpdate: () => void
}
const availableMcpTools = new Map()

const ChatInputArea = React.forwardRef<HTMLDivElement, ChatInputAreaProps>(({
  onMessagesUpdate,
}, ref) => {
  const { setChatContent } = useChatContext()

  // Use Zustand selectors to avoid unnecessary re-renders
  // Only subscribe to specific state slices instead of the entire store
  const setMessages = useChatStore(state => state.setMessages)
  const imageSrcBase64List = useChatStore(state => state.imageSrcBase64List)
  const setImageSrcBase64List = useChatStore(state => state.setImageSrcBase64List)
  const currentReqCtrl = useChatStore(state => state.currentReqCtrl)
  const readStreamState = useChatStore(state => state.readStreamState)
  const webSearchEnable = useChatStore(state => state.webSearchEnable)
  const toggleWebSearch = useChatStore(state => state.toggleWebSearch)
  const artifacts = useChatStore(state => state.artifacts)
  const toggleArtifacts = useChatStore(state => state.toggleArtifacts)
  const setArtifactsPanel = useChatStore(state => state.setArtifactsPanel)
  const selectedModel = useChatStore(state => state.selectedModel)
  const setSelectedModel = useChatStore(state => state.setSelectedModel)

  const {
    providers,
    models,
    setCurrentProviderName,
    mcpServerConfig,
  } = useAppConfigStore()
  useEffect(() => {
    if (models && models.length === 1) {
      setSelectedModel(models[0])
    }
  }, [models])
  const { setChatTitle, setChatUuid, setChatId } = useChatContext()
  const [inputContent, setInputContent] = useState<string>('')
  const [selectModelPopoutState, setSelectModelPopoutState] = useState<boolean>(false)
  const [selectMCPPopoutState, setSelectMCPPopoutState] = useState<boolean>(false)
  const [selectedMcpServerNames, setSelectedMcpServerNames] = useState<string[]>([])

  const [connectingMcpServers, setConnectingMcpServers] = useState<string[]>([])
  const [chatTemperature, setChatTemperature] = useState<number[]>([1])
  const [chatTopP, setChatTopP] = useState<number[]>([1])
  const [currentSystemPrompt, setCurrentSystemPrompt] = useState<string>('')

  // Textarea ref
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  
  // Custom Caret Ref
  const caretOverlayRef = useRef<CustomCaretRef>(null)

  const getIconSrc = (provider: string) => {
    let iconSrc = robotIcon
    const pName = provider.toLowerCase()
    switch (pName) {
      case "OpenAI".toLowerCase():
        iconSrc = openaiIcon
        break
      case "Anthropic".toLowerCase():
        iconSrc = anthropicIcon
        break
      case "DeepSeek".toLowerCase():
        iconSrc = deepseekIcon
        break
      case "MoonShot".toLowerCase():
        iconSrc = moonshotIcon
        break
      case "SilliconFlow".toLowerCase() || "SiliconCloud".toLowerCase():
        iconSrc = siliconcloudIcon
        break
      case "OpenRouter".toLowerCase():
        iconSrc = openrouterIcon
        break
      case "Ollamma".toLowerCase():
        iconSrc = ollamaIcon
        break
      case "Groq".toLowerCase():
        iconSrc = groqIcon
        break
      default:
        break
    }
    return iconSrc
  }

  const handleChatSubmit = useChatSubmit()
  const handleChatSubmitCallback = useCallback((text, img, options) => {
    handleChatSubmit(text, img, options)
  }, [handleChatSubmit])
  const onSubmitClick = useCallback((_event?: React.MouseEvent | React.KeyboardEvent) => {
    if (!inputContent) {
      return
    }
    if (!selectedModel) {
      toast.warning('Please select one model')
      return
    }
    onMessagesUpdate() // for chat-window scroll to the end
    const tools = Array.from(availableMcpTools.values()).flatMap(i => i)
    if (webSearchEnable) {
      const f = embeddedToolsRegistry.getTool('web_search')
      if (f) {
        tools.push({
          ...f.function
        })
      }
    }
    handleChatSubmitCallback(inputContent, imageSrcBase64List, { tools: tools, prompt: currentSystemPrompt })
    setInputContent('')
    setImageSrcBase64List([])

    // Reset caret position after clearing input
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.value = '' // Ensure DOM is synced
        textareaRef.current.dispatchEvent(new Event('input', { bubbles: true })) // Trigger auto-resize if needed
        caretOverlayRef.current?.updateCaret()
      }
    })
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
  // const onWebSearchClick = useCallback(() => {
  //   toggleWebSearch(!webSearchEnable)
  // }, [toggleWebSearch, webSearchEnable])
  // const onArtifactsClick = useCallback(() => {
  //   toggleArtifacts(!artifacts)
  // }, [artifacts, toggleArtifacts])
  const onTextAreaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputContent(e.target.value)
  }, [])

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

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        // found image from clipboard
        blob = items[i].getAsFile()
        break
      }
    }
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
  const onMcpToolSelected = async (serverName: string, serverConfig: any) => {
    console.log('mcp-server-config', serverName, serverConfig)
    if (!selectedMcpServerNames.includes(serverName)) {
      setConnectingMcpServers([...connectingMcpServers, serverName])

      const { result, tools, msg } = await invokeMcpConnect({
        name: serverName,
        ...serverConfig
      })
      setConnectingMcpServers(connectingMcpServers.filter(m => m !== serverName))
      if (result) {
        setSelectedMcpServerNames([...selectedMcpServerNames, serverName])
        availableMcpTools.set(serverName, tools)

        // 将 MCP tools 注册为 external tools
        tools.forEach((tool: any) => {
          embeddedToolsRegistry.registerExternal(tool.name, {
            type: 'function',
            function: tool
          })
        })

        toast.success(msg)
      } else {
        toast.error(msg)
      }
    } else {
      setSelectedMcpServerNames(selectedMcpServerNames.filter(item => item != serverName))

      // 取消注册 MCP tools
      const tools = availableMcpTools.get(serverName)
      if (tools) {
        tools.forEach((tool: any) => {
          embeddedToolsRegistry.unregisterExternal(tool.name)
        })
      }

      availableMcpTools.delete(serverName)
      await invokeMcpDisconnect({
        name: serverName
      })
      toast.warning(`Disconnected mcp-server '${serverName}'`)
    }
  }
  const onChatTopPChange = (val: number[]) => {
    setChatTopP(val)
  }
  const onChatTemperatureChange = (val: number[]) => {
    setChatTemperature(val)
  }

  const triggerButtonClassName = cn(
    "h-7 min-w-20 w-auto flex items-center justify-between px-2 py-0.5 gap-1 rounded-2xl",
    "bg-gray-100/80 dark:bg-gray-800/80", // Slightly transparent for backdrop blur
    "hover:bg-gray-200 dark:hover:bg-gray-700",
    "text-gray-600 dark:text-gray-400",
    "hover:text-gray-900 dark:hover:text-gray-100",
    "text-xs font-medium",
    "backdrop-blur-md border border-transparent hover:border-gray-200 dark:hover:border-gray-700", // Subtle border on hover
    "shadow-sm hover:shadow",
    "transition-all duration-200",
    "focus-visible:ring-0 focus-visible:ring-offset-0"
  )

  return (
    <div ref={ref} id='inputArea' className={cn('rounded-md w-full h-full flex flex-col')}>
      <div className={cn(imageSrcBase64List.length !== 0 ? 'h-28' : 'h-0')}>
        <ChatImgGalleryComponent />
      </div>

      <div id="inputArea" className='relative flex flex-col pb-2 px-2 flex-1 overflow-hidden'>
        <div id="inputSelector" className='rounded-t-2xl w-full bg-[#F9FAFB] dark:bg-gray-800 p-1 flex items-center space-x-2 flex-none h-10 select-none border-b-0 border-t-[1px] border-l-[1px] border-r-[1px] border-blue-gray-200 dark:border-gray-700'>
          <div id="modelSelector" className="app-undragable bg-transparent">
            <Popover open={selectModelPopoutState} onOpenChange={setSelectModelPopoutState}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={selectModelPopoutState}
                  className={triggerButtonClassName}
                >
                  <span className="flex flex-grow justify-center overflow-x-hidden">
                    {selectedModel ? (
                      (() => {
                        return selectedModel.type === 'vlm' ? (
                          <span className="flex items-center space-x-1.5">
                            <span>{selectedModel.name}</span>
                            <i className="ri-eye-line text-green-500 text-[10px]"></i>
                          </span>
                        ) : <span>{selectedModel.name}</span>
                      })()) : ("Select Model")}
                  </span>
                  <ChevronsUpDown className="flex opacity-50 w-4 h-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-full shadow-lg p-0 rounded-xl overflow-hidden bg-white/10 backdrop-blur-xl dark:bg-gray-900"
                sideOffset={8}
                align="start"
              >
                <Command className='rounded-xl bg-transparent dark:bg-gray-900'>
                  <CommandInput placeholder="Search model" className="h-auto" />
                  <CommandList>
                    {(models.findIndex(fm => fm.enable === true) != -1) && <CommandEmpty>Oops...NotFound</CommandEmpty>}
                    {providers.map((p) => p.models.length > 0 && p.models.findIndex(m => m.enable) !== -1 && (
                      <CommandGroup
                        key={p.name}
                        value={p.name}
                        className='scroll-smooth [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground'
                        heading={
                          <div className="flex items-center gap-2 px-2 py-1.5 dark:bg-gray-800/80 -mx-2 sticky top-0 z-10 border-b border-black/5 dark:border-gray-800">
                            <img
                              src={getIconSrc(p.name)}
                              alt={p.name}
                              className="w-4 h-4 object-contain dark:invert dark:brightness-90 opacity-70"
                            />
                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 tracking-tight">
                              {p.name}
                            </span>
                          </div>
                        }
                      >
                        <div className="pt-1">
                          {
                            p.models.map((m) => m.enable && (
                              <CommandItem
                                key={m.provider + '/' + m.value}
                                value={m.provider + '/' + m.value}
                                className="aria-selected:bg-blue-50 dark:aria-selected:bg-blue-900/20 aria-selected:text-blue-700 dark:aria-selected:text-blue-300 pl-4 py-2"
                                onSelect={(_) => {
                                  setSelectedModel(m)
                                  const p = providers.findLast(p => p.name == m.provider)!
                                  setCurrentProviderName(p.name)
                                  setSelectModelPopoutState(false)
                                }}
                              >
                                <span className="truncate">{m.name}</span>
                                {m.type === 'vlm' && <i className="ri-eye-line text-green-500 ml-2 text-xs"></i>}
                                {(selectedModel && selectedModel.value === m.value && selectedModel.provider === p.name) &&
                                  <Check className={cn("ml-auto w-4 h-4 text-blue-500")} />
                                }
                              </CommandItem>
                            ))
                          }
                        </div>
                      </CommandGroup>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div id="mcpSelector" className="app-undragable bg-transparent">
            <Popover open={selectMCPPopoutState} onOpenChange={setSelectMCPPopoutState}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={selectMCPPopoutState}
                  className={triggerButtonClassName}
                >
                  <span className="flex flex-grow justify-center overflow-x-hidden">
                    {selectedMcpServerNames.length === 0 ? 'MCP Tools' : selectedMcpServerNames[0]}
                  </span>
                  {selectedMcpServerNames.length > 1 && <Badge className="h-4 min-w-[16px] px-1 justify-center bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-[9px] hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-colors shadow-none">+{selectedMcpServerNames.length - 1}</Badge>}
                  <Plug className="flex opacity-50 w-4 h-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-full p-0 shadow-lg ml-1 rounded-xl overflow-hidden bg-white/10 backdrop-blur-xl dark:bg-gray-900"
                sideOffset={8}
                align="start"
              >
                <Command className='rounded-xl bg-transparent dark:bg-gray-900'>
                  <CommandInput placeholder="Search tool" className="h-auto" />
                  <CommandList>
                    <CommandGroup
                      className='scroll-smooth'
                    >
                      {
                        mcpServerConfig && mcpServerConfig.mcpServers && Object.entries(mcpServerConfig.mcpServers).map(([mcpName, mcpCfg], idx) => (
                          <CommandItem
                            key={idx}
                            value={mcpName}
                            onSelect={(selectVal) => {
                              onMcpToolSelected(selectVal, mcpCfg)
                            }}
                          >
                            {(selectedMcpServerNames && selectedMcpServerNames.includes(mcpName)) ? <span className="text-green-600">{mcpName}</span> : <span>{mcpName}</span>}
                            {connectingMcpServers.includes(mcpName) && <LoaderCircle className='ml-auto animate-spin' />}
                            {(selectedMcpServerNames && selectedMcpServerNames.includes(mcpName)) && <Check className={cn("ml-auto text-green-600")} />}
                          </CommandItem>
                        ))
                      }
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div id="customPanel" className='flex-grow w-full bg-transparent'>
            <div className='flex justify-end w-auto'>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className={triggerButtonClassName}
                  >
                    <span className="flex-grow text-center">Params</span>
                    <TokensIcon className="flex opacity-50 w-4 h-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-80 p-0 rounded-2xl overflow-hidden bg-white/10 dark:bg-gray-900/90 backdrop-blur-2xl border border-gray-200/50 dark:border-gray-700/50 shadow-2xl"
                  sideOffset={8}
                  align="end"
                >
                  <div className="flex flex-col">
                    {/* Header */}
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-900/50">
                      <span className='text-sm font-semibold text-gray-900 dark:text-gray-100'>Chat Configuration</span>
                      <Badge variant={'outline'} className='text-[10px] h-5 px-1.5 font-normal bg-white dark:bg-gray-800 border-yellow-400 text-yellow-500'>Session</Badge>
                    </div>

                    <div className="p-4 space-y-2">
                      {/* Temperature Slider */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="temperature" className="text-xs font-medium text-gray-700 dark:text-gray-300">Temperature</Label>
                          <span className="text-xs font-mono text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{chatTemperature}</span>
                        </div>
                        <Slider
                          id="temperature"
                          value={chatTemperature}
                          min={0}
                          max={1}
                          step={0.1}
                          onValueChange={value => onChatTemperatureChange(value)}
                          className="[&_.range-thumb]:h-4 [&_.range-thumb]:w-4"
                        />
                      </div>

                      {/* Top P Slider */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="topp" className="text-xs font-medium text-gray-700 dark:text-gray-300">Top P</Label>
                          <span className="text-xs font-mono text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{chatTopP}</span>
                        </div>
                        <Slider
                          id="topp"
                          value={chatTopP}
                          min={0}
                          max={1}
                          step={0.1}
                          onValueChange={value => onChatTopPChange(value)}
                          className="[&_.range-thumb]:h-4 [&_.range-thumb]:w-4"
                        />
                      </div>

                      {/* Max Tokens */}
                      <div className="space-y-2">
                        <Label htmlFor="maxCompletionTokens" className="text-xs font-medium text-gray-700 dark:text-gray-300">Max Tokens</Label>
                        <Input
                          id="maxCompletionTokens"
                          defaultValue="4096"
                          className="h-8 text-xs bg-white dark:bg-gray-950/50 border-gray-200 dark:border-gray-800 focus-visible:ring-1 focus-visible:ring-blue-500"
                        />
                      </div>

                      {/* System Prompt */}
                      <div className="space-y-2">
                        <Label htmlFor="systemPrompt" className="text-xs font-medium text-gray-700 dark:text-gray-300">System Prompt</Label>
                        <Textarea
                          id="systemPrompt"
                          value={currentSystemPrompt}
                          placeholder='You are a helpful assistant...'
                          className="min-h-[80px] text-xs bg-white dark:bg-gray-950/50 border-gray-200 dark:border-gray-800 focus-visible:ring-1 focus-visible:ring-blue-500 resize-none p-2"
                          onChange={e => setCurrentSystemPrompt(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Footer Action */}
                    <div className="p-2 bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
                      <Button variant="ghost" size="sm" className="w-full h-7 text-xs text-gray-500 hover:text-gray-900 dark:hover:text-gray-100">
                        Reset to Defaults
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>

        <div className="relative flex-1 overflow-hidden">
          <Textarea
            ref={textareaRef}
            className={
              cn('bg-gray-50 dark:bg-gray-800 focus:bg-white/50 dark:focus:bg-gray-700/50 backdrop-blur-3xl text-sm p-2',
                'rounded-none resize-none pb-2 overflow-y-auto font-mono text-gray-700 dark:text-gray-300 caret-transparent w-full h-full border-0 border-l-[1px] border-r-[1px] border-blue-gray-200 dark:border-gray-700',
              )
            }
            placeholder='Type anything to chat'
            value={inputContent}
            onChange={onTextAreaChange}
            onKeyDown={onTextAreaKeyDown}
            onPaste={onTextAreaPaste}
          />

          <CustomCaretOverlay
            ref={caretOverlayRef}
            textareaRef={textareaRef}
          />
        </div>

        <div id="inputAreaBottom" className="rounded-b-2xl z-10 w-full bg-[#F9FAFB] dark:bg-gray-800 p-1 pl-2 flex border-b-[1px] border-l-[1px] border-r-[1px] border-blue-gray-200 dark:border-gray-700 flex-none h-10">
          <div className='flex-grow flex items-center space-x-2 select-none relative'>
            <TooltipProvider delayDuration={400}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 rounded-xl text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200"
                    onClick={startNewChat}
                  >
                    <BadgePlus className='w-5 h-5' strokeWidth={2} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-black/80 backdrop-blur-md border-0 text-gray-100 text-xs px-2 py-1 rounded-md mb-2">
                  <p>New Chat</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* WebSearch are embedded no need to toggle anymore maybe put thinking toggle here later~ */}
            {/* <TooltipProvider delayDuration={400}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className={cn(
                      "h-8 w-8 rounded-xl transition-all duration-200",
                      webSearchEnable
                        ? "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 hover:bg-blue-200 hover:text-blue-400 dark:hover:bg-blue-900/60"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700"
                    )}
                    onClick={onWebSearchClick}
                  >
                    <Globe className="w-5 h-5" strokeWidth={2} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-black/80 backdrop-blur-md border-0 text-gray-100 text-xs px-2 py-1 rounded-md mb-2">
                  <p>Web Search {webSearchEnable ? 'On' : 'Off'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider> */}

            <TooltipProvider delayDuration={400}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className={cn(
                      "h-8 w-8 rounded-xl transition-all duration-200",
                      artifacts
                        ? "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 hover:bg-blue-200 hover:text-blue-400 dark:hover:bg-blue-900/60"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700"
                    )}
                    onClick={() => {
                      const newState = !artifacts
                      toggleArtifacts(newState)
                      setArtifactsPanel(newState)
                    }}
                  >
                    <Package className="w-5 h-5" strokeWidth={2} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-black/80 backdrop-blur-md border-0 text-gray-100 text-xs px-2 py-1 rounded-md mb-2">
                  <p>Artifacts {artifacts ? 'On' : 'Off'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div className='absolute right-0 bottom-0'>
              {!readStreamState
                ? (
                  <Button onClick={onSubmitClick} variant={'default'} size={'sm'} className='rounded-full border-[1px] border-gray-300 dark:border-gray-600 hover:bg-gray-600 dark:hover:bg-gray-500'>
                    <PaperPlaneIcon className="-rotate-45 mb-0.5 ml-0.5 w-8 dark:text-gray-400" />
                    <sub className="text-gray-400 dark:text-gray-400 flex"><ArrowBigUp className="w-3" /><CornerDownLeft className="w-3" /></sub>
                  </Button>
                )
                : <Button variant={'destructive'} size={'sm'}
                  className={cn('rounded-full border-[1px] hover:bg-red-400 dark:hover:bg-red-500 animate-pulse transition-transform duration-800')}
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
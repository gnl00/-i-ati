import React, { useState, useCallback } from 'react'
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
  CirclePlus,
  Boxes,
  CornerDownLeft,
  ArrowBigUp
} from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import ChatImgGalleryComponent from '@renderer/components/chat/ChatImgGalleryComponent'
import { useChatStore } from '@renderer/store'
import { useChatContext } from '@renderer/context/ChatContext'
import chatSubmit from '@renderer/hooks/use-chat-submit'

interface ChatInputAreaProps {
  onSubmit: () => void
  selectedMcpTools: string[]
  setSelectedMcpTools: (tools: string[]) => void
  mcpTools: string[]
}

const ChatInputArea = React.forwardRef<HTMLDivElement, ChatInputAreaProps>(({
  onSubmit,
  selectedMcpTools,
  setSelectedMcpTools,
  mcpTools
}, ref) => {
  const {setChatContent} = useChatContext()
  // Get state and actions from store
  const {
    imageSrcBase64List,
    setImageSrcBase64List,
    currentReqCtrl, 
    readStreamState, setReadStreamState,
    webSearchEnable, toggleWebSearch,
    webSearchProcessing, setWebSearchProcessState,
    providers,
    models,
    selectedModel,
    setSelectedModel,
    setCurrentProviderName
  } = useChatStore()
  const [inputContent, setInputContent] = useState<string>('')
  const [selectModelPopoutState, setSelectModelPopoutState] = useState<boolean>(false)
  const [selectMCPPopoutState, setSelectMCPPopoutState] = useState<boolean>(false)

  const useSubmit = chatSubmit()
  const onSubmitClick = useCallback((_) => {
    useSubmit(inputContent, imageSrcBase64List)

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
    console.log(`findImg? ${findImg}`)
    if (blob) {
        const reader = new FileReader()
        reader.readAsDataURL(blob)
        reader.onloadend = () => {
            setImageSrcBase64List([...imageSrcBase64List, reader.result as string])
        }
    }
  }, [imageSrcBase64List, setImageSrcBase64List])

  return (
    <div ref={ref} id='input-area' className={cn('p-6 pt-0 rounded-md fixed w-full h-52', imageSrcBase64List.length !== 0 ? 'bottom-36' : 'bottom-8')}>
      <div className={cn(imageSrcBase64List.length !== 0 ? 'h-28' : 'h-0')}>
          <ChatImgGalleryComponent></ChatImgGalleryComponent>
      </div>
      <div className='rounded-xl flex items-center space-x-2 pr-2 mb-2 select-none'>
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
                                      value={m.value}
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
  )
})

export default ChatInputArea
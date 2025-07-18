import { Textarea } from '@renderer/components/ui/textarea'
import { Badge } from "@renderer/components/ui/badge"
import { Button } from '@renderer/components/ui/button'
import { PaperPlaneIcon } from '@radix-ui/react-icons'
import ChatHeaderComponent from "@renderer/components/sys/ChatHeaderComponent"
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@renderer/components/ui/command'
import { Popover, PopoverTrigger, PopoverContent } from '@radix-ui/react-popover'

import { useChatStore } from '@renderer/store'
import { useChatContext } from '@renderer/context/ChatContext'
import { useState } from 'react'
import { ChevronsUpDown, Check, SlidersHorizontal } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

const ChatWindowComponentV2 = () => {
  const { 
      currentReqCtrl, 
      readStreamState, setReadStreamState, 
      setProvider, 
      providers, 
      models, 
      selectedModel, 
      setSelectedModel, 
      imageSrcBase64List, setImageSrcBase64List
  } = useChatStore()

  const [selectModelPopoutState, setSelectModelPopoutState] = useState<boolean>(false)
  const [selectMCPPopoutState, setSelectMCPPopoutState] = useState<boolean>(false)

  return (
    <div className="h-svh relative app-undragable flex flex-col" style={{
      backgroundColor: '#f9f9f9',
      backgroundImage: `radial-gradient(circle at 1px 1px, rgba(139,125,102,0.15) 1px, transparent 0)`,
      backgroundSize: '50px 50px'
    }}>
      <ChatHeaderComponent />
      <div className="mt-14">chat-list</div>
      <div className="p-6 rounded-md fixed bottom-10 w-full h-52">
        <div className='backdrop-blur-2xl rounded-xl flex items-center space-x-2 pl-2 pr-2 mb-2 select-none'>
          <div className="app-undragable">
            <Popover open={selectModelPopoutState} onOpenChange={setSelectModelPopoutState}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={selectModelPopoutState}
                  className="w-auto justify-between flex p-1 rounded-full bg-gray-100"
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
                <Command className='z-10 rounded-xl'>
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
                  className="w-auto justify-between flex p-1 rounded-full bg-gray-100"
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
                <Command className='z-10 rounded-xl'>
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
            className="bg-gray-50 text-base p-2 h-full border-b-[0px] rounded-bl-none rounded-br-none
              rounded-t-2xl resize-none pr-12 pb-12 overflow-y-auto" 
            placeholder='Type anything to chat'
            ></Textarea>
          <div className='absolute bottom-0 rounded-b-2xl z-10 w-full bg-[#F9FAFB] p-1 pl-4 flex border-b-[1px] border-l-[1px] border-r-[1px]'>
            <div className='flex-grow flex space-x-2 select-none relative'>
              <div><Badge className='flex justify-center'>files</Badge></div>
              <div><Badge variant="secondary" className='bg-gray-200 hover:bg-gray-300 text-gray-600 flex justify-center'>thinking</Badge></div>
              <div><Badge variant="secondary" className="bg-blue-500 text-white hover:bg-blue-300 flex justify-center">search</Badge></div>
              {/* <div><Badge variant="secondary" className='border-[1px] border-gray-200 hover:bg-gray-300 text-blue-600 w-10 flex justify-center'>MCP</Badge></div> */}
              <div className='absolute right-0 bottom-0'><Button variant={'secondary'} size={'sm'} className='rounded-2xl border-[1px] border-gray-300 hover:bg-gray-200'><PaperPlaneIcon className="-rotate-45 mb-0.5 ml-0.5 w-8" /></Button></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ChatWindowComponentV2
import React, { useState } from 'react'
import { Popover, PopoverTrigger, PopoverContent } from '@radix-ui/react-popover'
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '../ui/command'
import { Button } from '../ui/button'
import { ChevronsUpDown, Check } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { useChatStore } from '@renderer/store'
import { PaperPlaneIcon } from '@radix-ui/react-icons'
import { StopIcon } from '@radix-ui/react-icons'

interface ToolBarProps {
    onSubmit: (textCtx: string, mediaCtx: ClipbordImg[] | string[]) => Promise<void>
}

const ToolBarComponent: React.FC<ToolBarProps> = (props: ToolBarProps) => {
    const { onSubmit } = props
    const [selectModelPopoutState, setSelectModelPopoutState] = useState<boolean>(false)
    const {currentReqCtrl, readStreamState, setReadStreamState, providers, models, selectedModel, setSelectedModel, 
        chatContent, setChatContent, imageSrcBase64List, setImageSrcBase64List
    } = useChatStore()
    const onSubmitClick = (_) => {
        onSubmit(chatContent, imageSrcBase64List)
        setChatContent('')
        setImageSrcBase64List([])
    }
    const onStopClick = (_) => {
        if (currentReqCtrl) {
            currentReqCtrl.abort()
            setReadStreamState(false)
        }
    }
    return (
        <div className="app-undragable flex items-center min-h-[2.5vh] pt-0.5 pb-0.5 pl-1 border-1 border-b">
            <div className="app-undragable">
                <Popover open={selectModelPopoutState} onOpenChange={setSelectModelPopoutState}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={selectModelPopoutState}
                            className="w-[22vw] max-w-[25vw] justify-between flex pl-1 pr-1"
                        >
                            <span className="flex flex-grow overflow-x-hidden">
                                {selectedModel ? (
                                    (() => {
                                        const selected = models.find(m => m.value === selectedModel);
                                        if (!selected) return null;
                                        return selected.type === 'vlm' ? (
                                            <span className="flex space-x-2">
                                                <span>{selected.value}</span>
                                                <i className="ri-eye-line text-green-500"></i>
                                            </span>
                                        ) : (
                                            selected.value
                                        );
                                    })()
                                ) : (
                                    "Select model..."
                                )}
                            </span>
                            <ChevronsUpDown className="flex opacity-50" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0">
                        <Command>
                            <CommandInput placeholder="Search model..." className="h-auto" />
                            <CommandList>
                                <CommandEmpty>Oops...NotFound</CommandEmpty>
                                {
                                    providers.map((p) => p.models.length > 0 && (
                                        <CommandGroup
                                            key={p.name}
                                            value={p.name}
                                            className='scroll-smooth'
                                        >
                                            <span className="text-xs text-gray-400">{p.name}</span>
                                            {
                                                p.models.map((m) => (
                                                    <CommandItem
                                                        key={m.value}
                                                        value={m.value}
                                                        onSelect={(currentValue) => {
                                                            setSelectedModel(currentValue)
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
                                    ))
                                }
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>
            </div>
            <div className="flex-grow app-dragable flex">
                <div className='flex-grow'></div>
                <div className="app-undragable flex justify-end items-center mr-0.5">
                    {(!readStreamState ? (
                        <Button
                            className={cn(
                                "mt-0.5 mb-0.5 flex items-center transition-transform duration-1500 hover:animate-bounce",
                                readStreamState ? "-translate-x-full opacity-0" : ""
                            )}
                            type="submit"
                            size={'sm'}
                            onClick={onSubmitClick}
                        >
                            Enter&ensp;<PaperPlaneIcon className="-rotate-45 mb-1.5" />
                        </Button>
                    ) : (
                        <Button
                            className={cn(
                                "flex items-center animate-pulse transition-transform duration-700 hover:scale-120 hover:-translate-y-1 hover:-translate-x-1",
                                readStreamState ? "" : "-translate-x-full opacity-0"
                            )}
                            variant="destructive"
                            type="submit"
                            onClick={onStopClick}
                        >
                            Stop&ensp;<StopIcon />
                        </Button>
                    ))}
                </div>
            </div>
        </div>
    )
}

export default ToolBarComponent
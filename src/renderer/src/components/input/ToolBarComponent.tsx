import React, { useState } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '@radix-ui/react-popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '../ui/command';
import { Button } from '../ui/button';
import { ChevronsUpDown, Check } from 'lucide-react';
import { cn } from '@renderer/lib/utils';
import { useChatStore } from '@renderer/store';

interface ToolBarProps {}

const ToolBarComponent: React.FC<ToolBarProps> = (props: ToolBarProps) => {
    const [selectModelPopoutState, setSelectModelPopoutState] = useState<boolean>(false)
    const {models, selectedModel, setSelectedModel} = useChatStore()

    return (
        <div className="app-undragable flex min-h-[2.5vh] pt-0.5 pb-0.5 pl-1">
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
                                                <span>{selected.name}</span>
                                                <i className="ri-eye-line text-green-500"></i>
                                            </span>
                                        ) : (
                                            selected.name
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
                            <CommandInput placeholder="Search model..." className="h-9" />
                            <CommandList>
                                <CommandEmpty>Oops...NotFound</CommandEmpty>
                                <CommandGroup>
                                    {models.map((m) => (
                                        <CommandItem
                                            key={m.value}
                                            value={m.value}
                                            onSelect={(currentValue) => {
                                                setSelectedModel(currentValue)
                                                setSelectModelPopoutState(false)
                                            }}
                                        >
                                            {m.name}
                                            {m.type === 'vlm' && <i className="ri-eye-line text-green-500"></i>}
                                            <Check className={cn("ml-auto", selectedModel === m.value ? "opacity-100" : "opacity-0")} />
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>
            </div>
            <div className="flex-grow app-dragable"></div>
        </div>
    );
};

export default ToolBarComponent
import React, { useState } from 'react'
import { Cross1Icon } from '@radix-ui/react-icons'
import { Eye, EyeOff } from 'lucide-react'

import { Button } from '@renderer/components/ui/button'
import { Drawer, DrawerClose, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from '@renderer/components/ui/drawer'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@renderer/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { cn } from '@renderer/lib/utils'
import { getProviderIcon } from '@renderer/utils/providerIcons'

interface ProviderListSidebarProps {
    providers: ProviderDefinition[]
    selectedProviderId?: string
    onSelectProvider: (definition: ProviderDefinition) => void
    onDeleteProvider: (event: React.MouseEvent, definition: ProviderDefinition) => void
    addProvider: {
        displayName: string
        adapterType: string
        apiUrl: string
        apiKey: string
        showApiKey: boolean
        onDisplayNameChange: (value: string) => void
        onAdapterTypeChange: (value: string) => void
        onApiUrlChange: (value: string) => void
        onApiKeyChange: (value: string) => void
        onToggleShowApiKey: () => void
        onSave: (event: React.MouseEvent) => void
    }
}

const ProviderListSidebar: React.FC<ProviderListSidebarProps> = ({
    providers,
    selectedProviderId,
    onSelectProvider,
    onDeleteProvider,
    addProvider
}) => {
    const [hoverProviderCardIdx, setHoverProviderCardIdx] = useState<number>(-1)

    return (
        <div className='w-1/4 flex flex-col bg-white dark:bg-gray-800 rounded-md shadow-xs'>
            <div className='flex-none bg-linear-to-b from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 border-b dark:border-gray-700 p-2'>
                <Drawer>
                    <DrawerTrigger className={cn(
                        'group w-full p-0 rounded-lg',
                        'text-gray-600 dark:text-gray-400',
                        'hover:text-gray-900 dark:hover:text-gray-100',
                        'hover:bg-white dark:hover:bg-gray-700',
                        'hover:shadow-md hover:shadow-gray-200/50 dark:hover:shadow-gray-900/50',
                        'active:scale-[0.98]',
                        'transition-all duration-200 ease-out',
                        'border border-transparent hover:border-gray-200 dark:hover:border-gray-600',
                        'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2'
                    )}>
                        <div className='flex items-center justify-center gap-2 py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg bg-linear-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-750'>
                            <i className={cn(
                                'ri-add-circle-line text-xl transition-all duration-200 ease-out',
                                'group-hover:scale-110 group-hover:rotate-90'
                            )}></i>
                            <span className='text-sm font-medium transition-colors duration-200'>Add Provider</span>
                        </div>
                    </DrawerTrigger>
                    <DrawerContent>
                        <DrawerHeader>
                            <DrawerTitle>Add Provider</DrawerTitle>
                        </DrawerHeader>
                        <div id='add-new-provider-drawer' className="px-4 pb-4 app-undragable">
                            <div className="flex flex-col gap-4">
                                <div className="flex flex-col items-start gap-2">
                                    <Label htmlFor="provider-name" className="text-sm font-medium">Display Name</Label>
                                    <Input
                                        id="provider-name"
                                        placeholder="OpenAI"
                                        className="focus-visible:ring-transparent focus-visible:ring-offset-0 w-full h-10"
                                        value={addProvider.displayName}
                                        onChange={event => addProvider.onDisplayNameChange(event.target.value)}
                                    />
                                </div>
                                <div className="flex flex-col items-start gap-2">
                                    <Label htmlFor="adapterType" className="text-sm font-medium">Adapter</Label>
                                    <Select value={addProvider.adapterType} onValueChange={addProvider.onAdapterTypeChange}>
                                        <SelectTrigger id="adapterType" className="focus-visible:ring-transparent focus-visible:ring-offset-0 w-full h-10">
                                            <SelectValue placeholder="Select adapter" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectGroup>
                                                <SelectItem value="openai">OpenAI Compatible</SelectItem>
                                                <SelectItem value="claude">Claude Compatible</SelectItem>
                                            </SelectGroup>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex flex-col items-start gap-2">
                                    <Label htmlFor="apiUrl" className="text-sm font-medium">API Base URL</Label>
                                    <Input
                                        id="apiUrl"
                                        placeholder="https://api.openai.com"
                                        className="focus-visible:ring-transparent focus-visible:ring-offset-0 w-full h-10"
                                        value={addProvider.apiUrl}
                                        onChange={event => addProvider.onApiUrlChange(event.target.value)}
                                    />
                                </div>
                                <div className="flex flex-col items-start gap-2">
                                    <Label htmlFor="apiKey" className="text-sm font-medium">API Key</Label>
                                    <div className="relative w-full">
                                        <Input
                                            id="apiKey"
                                            type={addProvider.showApiKey ? 'text' : 'password'}
                                            placeholder="sk-********"
                                            className="focus-visible:ring-transparent focus-visible:ring-offset-0 w-full h-10 pr-10 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                                            value={addProvider.apiKey}
                                            onChange={event => addProvider.onApiKeyChange(event.target.value)}
                                        />
                                        <button
                                            type="button"
                                            onClick={addProvider.onToggleShowApiKey}
                                            className={cn(
                                                'absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center p-1 rounded-md',
                                                'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300',
                                                'hover:bg-gray-100 dark:hover:bg-gray-600/50',
                                                'transition-all duration-200',
                                                'active:scale-90 hover:scale-110'
                                            )}
                                            tabIndex={-1}
                                        >
                                            <span className={cn(
                                                'transition-all duration-300 ease-in-out',
                                                addProvider.showApiKey ? 'opacity-100 scale-100' : 'opacity-0 scale-75 absolute'
                                            )}>
                                                <EyeOff className="w-4 h-4" />
                                            </span>
                                            <span className={cn(
                                                'transition-all duration-300 ease-in-out',
                                                !addProvider.showApiKey ? 'opacity-100 scale-100' : 'opacity-0 scale-75 absolute'
                                            )}>
                                                <Eye className="w-4 h-4" />
                                            </span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <DrawerFooter className="flex-row gap-2 px-4 pb-4">
                            <DrawerClose asChild>
                                <Button variant="outline" className="flex-1 rounded-xl">Cancel</Button>
                            </DrawerClose>
                            <DrawerTrigger asChild>
                                <Button onClick={addProvider.onSave} className="flex-1 rounded-xl">Save</Button>
                            </DrawerTrigger>
                        </DrawerFooter>
                    </DrawerContent>
                </Drawer>
            </div>
            <div className='flex-1 overflow-y-auto p-2 space-y-1'>
                <TooltipProvider>
                    {providers.map((definition, idx) => {
                        const iconKey = definition.iconKey || definition.id
                        const iconSrc = getProviderIcon(iconKey)
                        const isActive = definition.id === selectedProviderId

                        return (
                            <div
                                key={definition.id}
                                className={cn(
                                    'flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer select-none relative group',
                                    'transition-all duration-200 ease-out',
                                    isActive
                                        ? 'bg-linear-to-r from-blue-50/80 via-blue-50/30 to-transparent dark:from-blue-900/20 dark:via-blue-900/10 dark:to-transparent after:content-["" ] after:absolute after:bottom-0.5 after:left-3 after:w-28 after:h-0.5 after:bg-linear-to-r after:from-blue-500 after:via-blue-400/60 after:to-transparent after:rounded-full hover:from-blue-50/90 hover:via-blue-50/40 dark:hover:from-blue-900/25 dark:hover:via-blue-900/15'
                                        : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                                )}
                                onMouseEnter={() => setHoverProviderCardIdx(idx)}
                                onMouseLeave={() => setHoverProviderCardIdx(-1)}
                                onClick={() => onSelectProvider(definition)}
                            >
                                {iconSrc && (
                                    <img
                                        id="providerIcon"
                                        draggable={false}
                                        src={iconSrc}
                                        alt={definition.displayName}
                                        className={cn(
                                            'w-5 h-5 flex-none dark:invert dark:brightness-90 transition-all duration-200 ease-out',
                                            hoverProviderCardIdx === idx && 'scale-110',
                                            isActive && 'scale-125'
                                        )}
                                    />
                                )}
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div className="flex-1 min-w-0">
                                            <p className={cn(
                                                'truncate font-medium text-sm text-gray-700 dark:text-gray-300 transition-colors duration-200 ease-out',
                                                hoverProviderCardIdx === idx && 'text-gray-900 dark:text-gray-100'
                                            )}>
                                                {definition.displayName}
                                            </p>
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>{definition.displayName}</p>
                                    </TooltipContent>
                                </Tooltip>
                                <button
                                    className={cn(
                                        'absolute -top-1 -right-1 z-10',
                                        'transition-all duration-200 ease-out',
                                        'opacity-0 scale-75 translate-x-2 pointer-events-none',
                                        hoverProviderCardIdx === idx &&
                                            'opacity-100 scale-100 translate-x-0 pointer-events-auto'
                                    )}
                                    onClick={(event) => onDeleteProvider(event, definition)}
                                    title="Delete provider"
                                >
                                    <div className={cn(
                                        'relative p-1.5 rounded-xl',
                                        'bg-rose-50/80 dark:bg-rose-950/40',
                                        'text-rose-600 dark:text-rose-400',
                                        'border border-rose-200/50 dark:border-rose-800/50',
                                        'shadow-inner',
                                        'transition-all duration-300 ease-out',
                                        'hover:scale-110 hover:rotate-90',
                                        'hover:bg-rose-100 dark:hover:bg-rose-900/50',
                                        'hover:shadow-lg hover:shadow-rose-500/10',
                                        'hover:-translate-y-0.5',
                                        'active:scale-95 active:shadow-inner active:translate-y-0 active:rotate-90'
                                    )}>
                                        <Cross1Icon className="w-2.5 h-2.5" />
                                    </div>
                                </button>
                            </div>
                        )
                    })}
                </TooltipProvider>
            </div>
        </div>
    )
}

export default ProviderListSidebar

import React, { useMemo, useState } from 'react'
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
import type { ProviderEntry } from '@renderer/store/appConfig'
import { getRequestAdapterOptionsFromPlugins } from '@shared/plugins/requestAdapters'
import { getProviderIcon } from '@renderer/utils/providerIcons'
import { ProviderIconPicker } from './ProviderIconPicker'
import {
    SettingsSidePanel,
    settingsInputClassName,
    settingsOutlineButtonClassName,
    settingsPrimaryButtonClassName,
    settingsScrollbarClassName,
    SettingsToolbarLabel
} from '../common/SettingsLayout'

interface ProviderListSidebarProps {
  plugins?: PluginEntity[]
  providers: ProviderEntry[]
  selectedProviderId?: string
  onSelectProvider: (definition: ProviderDefinition) => void
  onDeleteProvider: (event: React.MouseEvent, definition: ProviderDefinition) => void
    addProvider: {
        displayName: string
        adapterPluginId: string
        apiUrl: string
        apiKey: string
        iconKey?: string
        showApiKey: boolean
        onDisplayNameChange: (value: string) => void
        onAdapterPluginIdChange: (value: string) => void
        onApiUrlChange: (value: string) => void
        onApiKeyChange: (value: string) => void
        onIconKeyChange: (value?: string) => void
        onToggleShowApiKey: () => void
        onSave: (event: React.MouseEvent) => void
    }
}

const getProviderSortName = (entry: ProviderEntry): string => {
    return entry.definition.displayName || entry.definition.id
}

const compareProviderEntriesByName = (left: ProviderEntry, right: ProviderEntry): number => {
    const result = getProviderSortName(left).localeCompare(getProviderSortName(right), undefined, {
        sensitivity: 'base',
        numeric: true
    })

    return result || left.definition.id.localeCompare(right.definition.id)
}

const ProviderListSidebar: React.FC<ProviderListSidebarProps> = ({
    plugins,
    providers,
    selectedProviderId,
    onSelectProvider,
    onDeleteProvider,
    addProvider
}) => {
    const [hoverProviderId, setHoverProviderId] = useState<string | undefined>(undefined)
    const adapterOptions = getRequestAdapterOptionsFromPlugins(plugins)
    const providerGroups = useMemo(() => {
        return {
            enabled: providers
                .filter(entry => entry.definition.enabled !== false)
                .sort(compareProviderEntriesByName),
            disabled: providers
                .filter(entry => entry.definition.enabled === false)
                .sort(compareProviderEntriesByName)
        }
    }, [providers])

    const renderProviderEntry = ({ definition }: ProviderEntry) => {
        const iconKey = definition.iconKey || definition.id
        const iconSrc = getProviderIcon(iconKey)
        const isActive = definition.id === selectedProviderId
        const isProviderEnabled = definition.enabled !== false
        const isHovered = hoverProviderId === definition.id

        return (
            <div
                key={definition.id}
                className={cn(
                    'flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer select-none relative group',
                    'transition-all duration-200 ease-out',
                    isActive
                        ? 'bg-linear-to-r from-blue-50/80 via-blue-50/30 to-transparent dark:from-blue-900/20 dark:via-blue-900/10 dark:to-transparent after:content-["" ] after:absolute after:bottom-0.5 after:left-3 after:w-28 after:h-0.5 after:bg-linear-to-r after:from-blue-500 after:via-blue-400/60 after:to-transparent after:rounded-full hover:from-blue-50/90 hover:via-blue-50/40 dark:hover:from-blue-900/25 dark:hover:via-blue-900/15'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700/80'
                )}
                onMouseEnter={() => setHoverProviderId(definition.id)}
                onMouseLeave={() => setHoverProviderId(undefined)}
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
                            isProviderEnabled ? 'opacity-90' : 'opacity-35 grayscale',
                            isHovered && 'scale-110',
                            isActive && 'scale-125'
                        )}
                    />
                )}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <div className="flex-1 min-w-0">
                            <p className={cn(
                                'truncate font-medium text-sm transition-colors duration-200 ease-out',
                                isProviderEnabled
                                    ? 'text-gray-700 dark:text-gray-300'
                                    : 'text-gray-400 dark:text-gray-500',
                                isHovered && (
                                    isProviderEnabled
                                        ? 'text-gray-900 dark:text-gray-100'
                                        : 'text-gray-500 dark:text-gray-400'
                                )
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
                        isHovered && 'opacity-100 scale-100 translate-x-0 pointer-events-auto'
                    )}
                    onClick={(event) => onDeleteProvider(event, definition)}
                    title="Delete provider"
                >
                    <div className={cn(
                        'relative p-1.5 rounded-xl',
                        'bg-rose-50/85 dark:bg-rose-950/35',
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
    }

    return (
        <SettingsSidePanel>
            <div className='flex-none p-2'>
                <Drawer>
                    <DrawerTrigger className={cn(
                        settingsOutlineButtonClassName,
                        'group w-full h-9 justify-center rounded-lg border-dashed text-[12px]'
                    )}>
                        <i className='ri-add-circle-line text-[15px] transition-transform duration-150 group-hover:scale-105'></i>
                        <span>Add Provider</span>
                    </DrawerTrigger>
                    <DrawerContent className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                        <DrawerHeader className="px-4 pt-4 pb-2">
                            <DrawerTitle className="text-[13.5px] font-semibold tracking-tight text-gray-900 dark:text-gray-100">Add Provider</DrawerTitle>
                        </DrawerHeader>
                        <div id='add-new-provider-drawer' className="px-4 pb-3 app-undragable">
                            <div className="grid grid-cols-2 gap-x-2.5 gap-y-2">
                                {/* Name + Adapter — same row */}
                                <div className="space-y-1">
                                    <Label htmlFor="provider-name" className="text-[10.5px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Name</Label>
                                    <Input
                                        id="provider-name"
                                        placeholder="OpenAI"
                                        className={cn(settingsInputClassName, 'h-8 text-[12.5px] w-full')}
                                        value={addProvider.displayName}
                                        onChange={event => addProvider.onDisplayNameChange(event.target.value)}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="adapterPluginId" className="text-[10.5px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Adapter</Label>
                                    <Select value={addProvider.adapterPluginId} onValueChange={addProvider.onAdapterPluginIdChange}>
                                        <SelectTrigger id="adapterPluginId" className={cn(settingsInputClassName, 'h-8 text-[12.5px] w-full')}>
                                            <SelectValue placeholder="Select adapter" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-white/95 dark:bg-gray-900/95 rounded-lg shadow-xs backdrop-blur font-medium">
                                            <SelectGroup>
                                                {adapterOptions.map(option => (
                                                    <SelectItem
                                                        key={option.pluginId}
                                                        value={option.pluginId}
                                                        disabled={!option.enabled}
                                                        className="text-[11px] tracking-tight"
                                                    >
                                                        {option.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectGroup>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* API Base URL — full width */}
                                <div className="col-span-2 space-y-1">
                                    <Label htmlFor="apiUrl" className="text-[10.5px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">API Base URL</Label>
                                    <Input
                                        id="apiUrl"
                                        placeholder="https://api.openai.com"
                                        className={cn(settingsInputClassName, 'h-8 text-[12.5px] w-full')}
                                        value={addProvider.apiUrl}
                                        onChange={event => addProvider.onApiUrlChange(event.target.value)}
                                    />
                                </div>

                                {/* API Key — full width */}
                                <div className="col-span-2 space-y-1">
                                    <Label htmlFor="apiKey" className="text-[10.5px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">API Key</Label>
                                    <div className="relative w-full">
                                        <Input
                                            id="apiKey"
                                            type={addProvider.showApiKey ? 'text' : 'password'}
                                            placeholder="sk-********"
                                            className={cn(settingsInputClassName, 'h-8 text-[12.5px] w-full pr-9 dark:text-gray-200')}
                                            value={addProvider.apiKey}
                                            onChange={event => addProvider.onApiKeyChange(event.target.value)}
                                        />
                                        <button
                                            type="button"
                                            onClick={addProvider.onToggleShowApiKey}
                                            className={cn(
                                                'absolute right-2 top-1/2 -translate-y-1/2',
                                                'flex items-center justify-center p-1 rounded',
                                                'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300',
                                                'hover:bg-gray-100 dark:hover:bg-gray-700/50',
                                                'transition-colors duration-150'
                                            )}
                                            tabIndex={-1}
                                        >
                                            <span className={cn(
                                                'transition-all duration-300 ease-in-out',
                                                addProvider.showApiKey ? 'opacity-100 scale-100' : 'opacity-0 scale-75 absolute'
                                            )}>
                                                <EyeOff className="w-3.5 h-3.5" />
                                            </span>
                                            <span className={cn(
                                                'transition-all duration-300 ease-in-out',
                                                !addProvider.showApiKey ? 'opacity-100 scale-100' : 'opacity-0 scale-75 absolute'
                                            )}>
                                                <Eye className="w-3.5 h-3.5" />
                                            </span>
                                        </button>
                                    </div>
                                </div>

                                {/* Icon picker — full width */}
                                <div className="col-span-2">
                                    <ProviderIconPicker
                                        value={addProvider.iconKey}
                                        onChange={addProvider.onIconKeyChange}
                                    />
                                </div>
                            </div>
                        </div>
                        <DrawerFooter className="flex-row gap-2 px-4 pb-4">
                            <DrawerClose asChild>
                                <Button variant="outline" className={cn(settingsOutlineButtonClassName, 'flex-1 rounded-xl h-8 justify-center')}>Cancel</Button>
                            </DrawerClose>
                            <DrawerTrigger asChild>
                                <Button onClick={addProvider.onSave} className={cn(settingsPrimaryButtonClassName, 'flex-1 rounded-xl h-8 justify-center')}>Save</Button>
                            </DrawerTrigger>
                        </DrawerFooter>
                    </DrawerContent>
                </Drawer>
            </div>
            <div className={cn('flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-2 space-y-1 border-t border-gray-100 dark:border-gray-700/50', settingsScrollbarClassName)}>
                <TooltipProvider>
                    {providerGroups.enabled.length > 0 && (
                        <div className="space-y-1">
                            {providerGroups.enabled.map(renderProviderEntry)}
                        </div>
                    )}
                    {providerGroups.disabled.length > 0 && (
                        <div className="space-y-1 pt-2">
                            <SettingsToolbarLabel className="block px-3 pb-0.5 text-[10px]">
                                Disabled
                            </SettingsToolbarLabel>
                            {providerGroups.disabled.map(renderProviderEntry)}
                        </div>
                    )}
                </TooltipProvider>
            </div>
        </SettingsSidePanel>
    )
}

export default ProviderListSidebar

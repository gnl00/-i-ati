import { Cross1Icon } from "@radix-ui/react-icons"
import { Switch } from "@renderer/components/ui/switch"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@renderer/components/ui/table"
import { cn } from '@renderer/lib/utils'
import React, { useEffect, useState } from 'react'

import { Button } from "@renderer/components/ui/button"
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
} from "@renderer/components/ui/select"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger
} from "@renderer/components/ui/tooltip"
import { useAppConfigStore } from '@renderer/store/appConfig'
import { Trash } from "lucide-react"
import { toast } from 'sonner'

import anthropicIcon from '@renderer/assets/provider-icons/anthropic.svg'
import deepseekIcon from '@renderer/assets/provider-icons/deepseek.svg'
import groqIcon from '@renderer/assets/provider-icons/groq.svg'
import moonshotIcon from '@renderer/assets/provider-icons/moonshot.svg'
import ollamaIcon from '@renderer/assets/provider-icons/ollama.svg'
import openaiIcon from '@renderer/assets/provider-icons/openai.svg'
import openrouterIcon from '@renderer/assets/provider-icons/openrouter.svg'
import robotIcon from '@renderer/assets/provider-icons/robot-2-line.svg'
import siliconcloudIcon from '@renderer/assets/provider-icons/siliconcloud.svg'
import FetchModelsDrawer from './FetchModelsDrawer'

interface ProvidersManagerProps { }

const ProvidersManager: React.FC<ProvidersManagerProps> = () => {
    const {
        providers,
        getProviderByName,
        currentProviderName,
        setCurrentProviderName,
        updateProvider,
        addProvider,
        removeProvider,
        addModel,
        toggleModelEnable,
    } = useAppConfigStore()

    const [currentProvider, setCurrentProvider] = useState<IProvider | undefined>(undefined)
    const [editProviderName, setEditProviderName] = useState<string>(currentProvider?.name || '')
    const [editProviderApiUrl, setEditProviderApiUrl] = useState<string>(currentProvider?.apiUrl || '')
    const [editProviderApiKey, setEditProviderApiKey] = useState<string>(currentProvider?.apiKey || '')

    const [nextAddModelLabel, setNextAddModelLabel] = useState<string>('')
    const [nextAddModelValue, setNextAddModelValue] = useState<string>('')
    const [nextAddModelType, setNextAddModelType] = useState<string>('')

    const [newProviderName, setNewProviderName] = useState<string>()
    const [newProviderApi, setNewProviderApi] = useState<string>()
    const [newProviderApiKey, setNewProviderApiKey] = useState<string>()

    const [showFetchModelsDrawer, setShowFetchModelsDrawer] = useState<boolean>(false)
    const [hoverProviderCardIdx, setHoverProviderCardIdx] = useState<number>(-1)

    useEffect(() => {
        setEditProviderName('')
        setEditProviderApiUrl('')
        setEditProviderApiKey('')
    }, [])

    useEffect(() => {
        let p: IProvider | undefined
        if (currentProviderName && (p = getProviderByName(currentProviderName))) {
            setCurrentProvider(p)
            setEditProviderName(p.name)
            setEditProviderApiUrl(p.apiUrl)
            setEditProviderApiKey(p.apiKey)
        }
    }, [currentProviderName, providers])

    const onAddModelClick = () => {
        if (!currentProvider) return
        const newModel: IModel = {
            enable: true,
            provider: currentProvider.name,
            name: nextAddModelLabel,
            value: nextAddModelValue,
            type: nextAddModelType || 'llm'
        }

        addModel(currentProvider.name, newModel)

        setNextAddModelLabel('')
        setNextAddModelValue('')
        setNextAddModelType('')
    }

    const onAddProviderBtnClick = (e: React.MouseEvent) => {
        if (!newProviderName || !newProviderApi || !newProviderApiKey) {
            alert(`Please input providerName/baseUrl/Key(Token)`)
            e.preventDefault()
            return
        }
        if (providers.find(p => p.name == newProviderName) != undefined) {
            alert(`Provider:${newProviderName} already exists!`)
            e.preventDefault()
            return
        }
        const newProvider: IProvider = {
            name: newProviderName,
            models: [],
            apiUrl: newProviderApi,
            apiKey: newProviderApiKey
        }
        addProvider(newProvider)

        toast.success(`Added ${newProviderName}`)
    }

    const ICON_MAP = {
        'openai': openaiIcon,
        'anthropic': anthropicIcon,
        'deepseek': deepseekIcon,
        'moonshot': moonshotIcon,
        'siliconflow': siliconcloudIcon,
        'siliconcloud': siliconcloudIcon,
        'openrouter': openrouterIcon,
        'ollama': ollamaIcon,
        'groq': groqIcon,
    }

    const getIconSrc = (provider: string) => {
        return ICON_MAP[provider.toLowerCase()] || robotIcon
    }

    const onModelTableCellClick = (val: string) => {
        navigator.clipboard.writeText(val)
        toast.success('Copied')
    }

    const onProviderCardClick = (p: IProvider) => {
        setCurrentProviderName(p.name)
    }

    const onModelEnableStatusChange = (_checked: boolean, model: IModel) => {
        if (!currentProvider) return
        toggleModelEnable(currentProvider.name, model.value)
    }

    const updateCurrentProvider = (key: string, value: Object) => {
        if (currentProvider) {
            const oldProvider = currentProvider
            const newProvider = {
                ...oldProvider,
                [key]: value
            }
            setCurrentProvider(newProvider)
            updateProvider(oldProvider.name, newProvider)
        }
    }

    const onProviderCardHover = (idx: number) => {
        setHoverProviderCardIdx(idx)
    }

    const onProviderCardDelClick = (_e: any, provider: IProvider) => {
        if (currentProvider && currentProvider.name === provider.name) {
            setCurrentProvider(undefined)
        }
        if (currentProviderName && currentProviderName === provider.name) {
            setCurrentProviderName('')
        }
        removeProvider(provider.name)
    }

    const onModelDelClick = (model: IModel) => {
        if (currentProvider) {
            const nextModels = currentProvider.models.filter(m => m.name !== model.name && m.value !== model.value)
            updateProvider(currentProvider.name, {
                ...currentProvider,
                models: nextModels
            })
        }
    }

    return (
        <div className='w-[700px] h-[600px] focus:ring-0 focus-visible:ring-0'>
            <div className='flex h-full bg-gray-50 dark:bg-gray-900 p-2 rounded-md gap-2'>
                {/* Provider List Sidebar */}
                <div className='w-1/4 flex flex-col bg-white dark:bg-gray-800 rounded-md shadow-sm'>
                    <div className='flex-none bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 border-b dark:border-gray-700 p-2'>
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
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2'
                            )}>
                                <div className='flex items-center justify-center gap-2 py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-750'>
                                    <i className={cn(
                                        "ri-add-circle-line text-xl transition-all duration-200 ease-out",
                                        "group-hover:scale-110 group-hover:rotate-90"
                                    )}></i>
                                    <span className='text-sm font-medium transition-colors duration-200'>Add Provider</span>
                                </div>
                            </DrawerTrigger>
                            <DrawerContent>
                                <DrawerHeader>
                                    <DrawerTitle>Add New Provider</DrawerTitle>
                                </DrawerHeader>
                                <div id='add-new-provider-drawer' className="px-4 pb-4 app-undragable">
                                    <div className="flex flex-col gap-4">
                                        <div className="flex flex-col items-start gap-2">
                                            <Label htmlFor="name" className="text-sm font-medium">Name</Label>
                                            <Input
                                                id="name"
                                                placeholder="OpenAI"
                                                className="focus-visible:ring-transparent focus-visible:ring-offset-0 w-full h-10"
                                                onChange={e => { setNewProviderName(e.target.value) }}
                                            />
                                        </div>
                                        <div className="flex flex-col items-start gap-2">
                                            <Label htmlFor="apiUrl" className="text-sm font-medium">API URL</Label>
                                            <Input
                                                id="apiUrl"
                                                placeholder="https://api.openai.com/v1/chat/completions"
                                                className="focus-visible:ring-transparent focus-visible:ring-offset-0 w-full h-10"
                                                onChange={e => { setNewProviderApi(e.target.value) }}
                                            />
                                        </div>
                                        <div className="flex flex-col items-start gap-2">
                                            <Label htmlFor="apiKey" className="text-sm font-medium">API Key</Label>
                                            <Input
                                                id="apiKey"
                                                placeholder="sk-********"
                                                className="focus-visible:ring-transparent focus-visible:ring-offset-0 w-full h-10"
                                                onChange={e => { setNewProviderApiKey(e.target.value) }}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <DrawerFooter className="flex-row gap-2 px-4 pb-4">
                                    <DrawerClose asChild>
                                        <Button variant="outline" className="flex-1">Cancel</Button>
                                    </DrawerClose>
                                    <DrawerTrigger asChild>
                                        <Button onClick={onAddProviderBtnClick} className="flex-1">Save</Button>
                                    </DrawerTrigger>
                                </DrawerFooter>
                            </DrawerContent>
                        </Drawer>
                    </div>
                    <div className='flex-1 overflow-y-auto p-2 space-y-1'>
                        <TooltipProvider>
                            {
                                providers.map((p, idx) => (
                                    <div
                                        key={idx}
                                        className={cn(
                                            'flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer select-none relative group',
                                            'transition-all duration-200 ease-out',
                                            p.name === currentProviderName
                                                ? 'bg-gradient-to-r from-blue-50/80 via-blue-50/30 to-transparent dark:from-blue-900/20 dark:via-blue-900/10 dark:to-transparent after:content-[""] after:absolute after:bottom-0.5 after:left-3 after:w-28 after:h-0.5 after:bg-gradient-to-r after:from-blue-500 after:via-blue-400/60 after:to-transparent after:rounded-full hover:from-blue-50/90 hover:via-blue-50/40 dark:hover:from-blue-900/25 dark:hover:via-blue-900/15'
                                                : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                                        )}
                                        onMouseEnter={_ => onProviderCardHover(idx)}
                                        onMouseLeave={_ => onProviderCardHover(-1)}
                                        onClick={_ => onProviderCardClick(p)}
                                    >
                                        <img
                                            id="providerIcon"
                                            draggable={false}
                                            src={getIconSrc(p.name)}
                                            alt={p.name}
                                            className={cn(
                                                "w-5 h-5 flex-none dark:invert dark:brightness-90 transition-all duration-200 ease-out",
                                                hoverProviderCardIdx === idx && "scale-110",
                                                p.name === currentProviderName && "scale-125"
                                            )}
                                        />
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <p className={cn(
                                                    'truncate font-medium text-sm text-gray-700 dark:text-gray-300 flex-1 transition-colors duration-200 ease-out',
                                                    hoverProviderCardIdx === idx && 'text-gray-900 dark:text-gray-100'
                                                )}>
                                                    {p.name}
                                                </p>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>{p.name}</p>
                                            </TooltipContent>
                                        </Tooltip>
                                        <div
                                            className={cn(
                                                'absolute -top-1 -right-1 z-10 cursor-pointer',
                                                'transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]',
                                                'opacity-0 scale-90 translate-x-1 pointer-events-none',
                                                hoverProviderCardIdx === idx &&
                                                    'opacity-100 scale-100 translate-x-0 pointer-events-auto'
                                            )}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                onProviderCardDelClick(e, p)
                                            }}
                                        >
                                            <Cross1Icon className={cn(
                                                'rounded-full p-1 w-5 h-5',
                                                'shadow-sm hover:shadow-md',
                                                'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
                                                'border border-red-200 dark:border-red-800/50',
                                                'hover:bg-red-200 dark:hover:bg-red-900/50',
                                                'active:scale-95 transition-all duration-150 hover:rotate-90 hover:scale-110'
                                            )} />
                                        </div>
                                    </div>
                                ))
                            }
                        </TooltipProvider>
                    </div>
                </div>
                {/* Provider Details */}
                <div id="providerDetails" className='w-3/4 flex flex-col h-full gap-3 px-2 pt-2'>
                    {/* Provider Configuration Form */}
                    <div className='flex-none bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200/50 dark:border-gray-700/50 overflow-hidden'>
                        <div className='p-4 space-y-4'>
                            <div className='space-y-1'>
                                <Label htmlFor="provider-name" className='text-xs font-medium text-gray-500 dark:text-gray-400'>
                                    Provider Name
                                </Label>
                                <Input
                                    id="provider-name"
                                    className='h-10 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-0 transition-all'
                                    placeholder='provider name'
                                    value={editProviderName}
                                    onChange={(e) => {
                                        setEditProviderName(e.target.value)
                                        setCurrentProviderName(e.target.value)
                                        updateCurrentProvider('name', e.target.value)
                                    }}
                                />
                            </div>
                            <div className='space-y-1'>
                                <Label htmlFor="provider-api-url" className='text-xs font-medium text-gray-500 dark:text-gray-400'>
                                    API Base URL
                                </Label>
                                <Input
                                    id="provider-api-url"
                                    className='h-10 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-0 transition-all'
                                    placeholder='https://api.example.com'
                                    value={editProviderApiUrl}
                                    onChange={(e) => {
                                        setEditProviderApiUrl(e.target.value)
                                        updateCurrentProvider('apiUrl', e.target.value)
                                    }}
                                />
                                <p className="text-[10px] text-gray-400 dark:text-gray-500">
                                    Enter the base URL only (without version or endpoint path)
                                </p>
                            </div>
                            <div className='space-y-1'>
                                <Label htmlFor="provider-api-key" className='text-xs font-medium text-gray-500 dark:text-gray-400'>
                                    API Key
                                </Label>
                                <Input
                                    id="provider-api-key"
                                    type="password"
                                    className='h-10 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-0 transition-all'
                                    placeholder='sk-********'
                                    value={editProviderApiKey}
                                    onChange={(e) => {
                                        setEditProviderApiKey(e.target.value)
                                        updateCurrentProvider('apiKey', e.target.value)
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                    {/* Models List */}
                    <div className='flex-1 flex justify-between flex-col overflow-hidden bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200/50 dark:border-gray-700/50'>
                        <div className='flex justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50'>
                            <h3 className='text-sm font-medium flex items-center text-gray-700 dark:text-gray-300'>Models</h3>
                            <Button
                                size="xs"
                                variant="outline"
                                className='text-xs text-gray-600 dark:text-gray-400 font-medium transition-all data-[disabled]:text-gray-400 data-[disabled]:dark:text-gray-500'
                                onClick={() => setShowFetchModelsDrawer(true)}
                                disabled={!currentProvider?.apiKey}
                            >
                                <i className="ri-download-cloud-line mr-1"></i>
                                Fetch Models
                            </Button>
                        </div>
                        <div className='flex-1 overflow-y-auto scroll-smooth [&>div]:!overflow-visible'>
                            <TooltipProvider>
                                <Table id="provider-models-table" className='relative'>
                                    <TableHeader className='sticky top-0 z-10 bg-gray-50 dark:bg-gray-900/50 backdrop-blur-sm'>
                                        <TableRow className='border-b border-gray-200 dark:border-gray-700'>
                                            <TableHead className='px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider'>Name</TableHead>
                                            <TableHead className='px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider'>Model ID</TableHead>
                                            <TableHead className='px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider text-center'>Type</TableHead>
                                            <TableHead className='px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider text-center'>Status</TableHead>
                                            <TableHead className='px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider text-center'>Action</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {/* Add New Model Row */}
                                        <TableRow className='border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30'>
                                            <TableCell className='px-3 py-3'>
                                                <Input
                                                    className='h-9 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-0'
                                                    value={nextAddModelLabel}
                                                    onChange={e => setNextAddModelLabel(e.target.value)}
                                                    placeholder="Name"
                                                />
                                            </TableCell>
                                            <TableCell className='px-3 py-3'>
                                                <Input
                                                    className='h-9 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-0'
                                                    value={nextAddModelValue}
                                                    onChange={e => setNextAddModelValue(e.target.value)}
                                                    placeholder="ID"
                                                />
                                            </TableCell>
                                            <TableCell className='px-4 py-3'>
                                                <Select value={nextAddModelType} onValueChange={setNextAddModelType}>
                                                    <SelectTrigger className="h-9 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200">
                                                        <SelectValue placeholder="Type" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectGroup>
                                                            <SelectItem value="llm">LLM</SelectItem>
                                                            <SelectItem value="vlm">VLM</SelectItem>
                                                            <SelectItem value="t2i">T2I</SelectItem>
                                                        </SelectGroup>
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell className='px-4 py-3 text-center'>
                                                <span className='text-xs text-gray-400 dark:text-gray-500'>-</span>
                                            </TableCell>
                                            <TableCell className='px-4 py-3 text-center'>
                                                <Button
                                                    onClick={onAddModelClick}
                                                    size={'sm'}
                                                    variant={'default'}
                                                    className='h-7 px-3 text-xs shadow-sm hover:shadow-md transition-all duration-300 hover:scale-105 active:scale-95 group will-change-transform'
                                                >
                                                    <i className="ri-add-circle-line mr-1 text-sm group-hover:rotate-90 transition-transform duration-300"></i>
                                                    Add
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                        {/* Model List */}
                                        {
                                            providers.find(p => p.name === currentProviderName)?.models.map((m, idx) => (
                                                <TableRow
                                                    key={idx}
                                                    className={cn(
                                                        'border-b border-gray-200 dark:border-gray-700 transition-all duration-150',
                                                        'hover:bg-gray-50 dark:hover:bg-gray-700/50',
                                                        idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50/30 dark:bg-gray-800/50'
                                                    )}
                                                >
                                                    <TableCell className='px-4 py-3 text-left max-w-0'>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <p
                                                                    className='truncate text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:text-gray-900 dark:hover:text-gray-100 transition-colors'
                                                                    onClick={_ => onModelTableCellClick(m.name)}
                                                                >
                                                                    {m.name}
                                                                </p>
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                <p>{m.name}</p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </TableCell>
                                                    <TableCell className='px-4 py-3 text-left max-w-0'>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <p
                                                                    className='truncate text-sm text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-gray-200 transition-colors font-mono'
                                                                    onClick={_ => onModelTableCellClick(m.value)}
                                                                >
                                                                    {m.value}
                                                                </p>
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                <p>{m.value}</p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </TableCell>
                                                    <TableCell className='px-4 py-3 text-center'>
                                                        <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'>
                                                            {m.type.toUpperCase()}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className='px-4 py-3 text-center'>
                                                        <Switch
                                                            className='h-6'
                                                            checked={m.enable}
                                                            onCheckedChange={checked => onModelEnableStatusChange(checked, m)}
                                                        />
                                                    </TableCell>
                                                    <TableCell className='px-4 py-3 text-center'>
                                                        <button
                                                            onClick={_ => onModelDelClick(m)}
                                                            className='inline-flex items-center justify-center p-1.5 rounded-md text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-300 transition-all duration-200 hover:scale-110 active:scale-95'
                                                            title="Delete model"
                                                        >
                                                            <Trash className='w-4 h-4' />
                                                        </button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        }
                                        {/* Empty State */}
                                        {providers.find(p => p.name === currentProviderName)?.models.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={5} className='px-4 py-12 text-center'>
                                                    <div className='flex flex-col items-center justify-center text-gray-400 dark:text-gray-500'>
                                                        <p className='text-sm'>No models yet</p>
                                                        <p className='text-xs mt-1'>Add a model using the form above</p>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </TooltipProvider>
                        </div>
                    </div>
                </div>
            </div>

            {/* Fetch Models Drawer */}
            <FetchModelsDrawer
                open={showFetchModelsDrawer}
                onOpenChange={setShowFetchModelsDrawer}
                currentProvider={currentProvider}
                addModel={addModel}
            />
        </div>
    )
}

export default ProvidersManager

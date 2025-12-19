import React, { useEffect, useRef, useState } from 'react'
import { Cross1Icon } from "@radix-ui/react-icons"
import { cn } from '@renderer/lib/utils'
import { Switch } from "@renderer/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@renderer/components/ui/tabs"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@renderer/components/ui/table"
import { Checkbox } from "@renderer/components/ui/checkbox"
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
    } from "@renderer/components/ui/select"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    } from "@renderer/components/ui/dropdown-menu"
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
    TooltipProvider
    } from "@renderer/components/ui/tooltip"
import { Button } from "@renderer/components/ui/button"
import { Badge } from '@renderer/components/ui/badge'
import { Label } from '@renderer/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { Command, CommandItem, CommandGroup, CommandEmpty, CommandList, CommandInput } from '@renderer/components/ui/command'
import { Check, ChevronsUpDown, SquarePen, Trash } from "lucide-react"
import { Drawer, DrawerHeader, DrawerContent, DrawerTitle, DrawerTrigger, DrawerFooter, DrawerClose } from '@renderer/components/ui/drawer'
import { Input } from '@renderer/components/ui/input'
import { toast as sonnerToast } from 'sonner'
import { useChatStore } from '@renderer/store'

import openaiIcon from '@renderer/assets/provider-icons/openai.svg'
import anthropicIcon from '@renderer/assets/provider-icons/anthropic.svg'
import deepseekIcon from '@renderer/assets/provider-icons/deepseek.svg'
import moonshotIcon from '@renderer/assets/provider-icons/moonshot.svg'
import openrouterIcon from '@renderer/assets/provider-icons/openrouter.svg'
import siliconcloudIcon from '@renderer/assets/provider-icons/siliconcloud.svg'
import ollamaIcon from '@renderer/assets/provider-icons/ollama.svg'
import groqIcon from '@renderer/assets/provider-icons/groq.svg'
import robotIcon from '@renderer/assets/provider-icons/robot-2-line.svg'
import CodeEditor from '@uiw/react-textarea-code-editor'

interface PreferenceProps {}

const PreferenceComponent: React.FC<PreferenceProps> = () => {

    const { 
        appVersion,
        appConfig,
        setAppConfig, 
        models, 
        providers, setProviders,
        getProviderByName,
        currentProviderName,
        setCurrentProviderName,
        updateProvider,
        addProvider, 
        removeProvider,
        addModel,
        toggleModelEnable,
        titleGenerateModel, setTitleGenerateModel,
        titleGenerateEnabled, setTitleGenerateEnabled,
        mcpServerConfig, setMcpServerConfig,
    } = useChatStore()

    const [currentProvider, setCurrentProvider] = useState<IProvider | undefined>(undefined)
    const [editProviderName, setEditProviderName] = useState<string>(currentProvider?.name || '')
    const [editProviderApiUrl, setEditProviderApiUrl] = useState<string>(currentProvider?.apiUrl || '')
    const [editProviderApiKey, setEditProviderApiKey] = useState<string>(currentProvider?.apiKey || '')

    const [nextAddModelEnable, setNextAddModelEnable] = useState<boolean>(false)
    const [nextAddModelLabel, setNextAddModelLabel] = useState<string>('')
    const [nextAddModelValue, setNextAddModelValue] = useState<string>('')
    const [nextAddModelType, setNextAddModelType] = useState<string>('')
    
    const [selectTitleModelPopoutState, setSelectTitleModelPopoutState] = useState(false)
    
    const [newProviderName, setNewProviderName] = useState<string>()
    const [newProviderApi, setNewProviderApi] = useState<string>()
    const [newProviderApiKey, setNewProviderApiKey] = useState<string>()

    const [msConfig, setmsConfig] = useState<string>(JSON.stringify(mcpServerConfig, null, 2))

    const [hoverProviderCardIdx, setHoverProviderCardIdx] = useState<number>(-1)
    
    // Tabs 滑动指示器相关 state
    const [activeTab, setActiveTab] = useState<string>('provider-list')
    const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number }>({ left: 0, width: 0 })
    const tabRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({})
    const tabsListRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        setEditProviderName('')
        setEditProviderApiUrl('')
        setEditProviderApiKey('')
    }, [])
    
    // 更新滑动指示器位置
    useEffect(() => {
        const updateIndicator = () => {
            const activeTabElement = tabRefs.current[activeTab]
            const tabsListElement = tabsListRef.current
            
            if (activeTabElement && tabsListElement) {
                const tabsListRect = tabsListElement.getBoundingClientRect()
                const tabRect = activeTabElement.getBoundingClientRect()
                
                setIndicatorStyle({
                    left: tabRect.left - tabsListRect.left,
                    width: tabRect.width
                })
            }
        }
        
        // 使用 requestAnimationFrame 确保 DOM 已渲染
        const rafId = requestAnimationFrame(() => {
            updateIndicator()
            // 再次延迟以确保样式已应用
            setTimeout(updateIndicator, 0)
        })
        
        // 监听窗口 resize，确保窗口大小改变时指示器位置正确
        window.addEventListener('resize', updateIndicator)
        return () => {
            cancelAnimationFrame(rafId)
            window.removeEventListener('resize', updateIndicator)
        }
    }, [activeTab])
    useEffect(() => {
        // console.log('currentProviderName', currentProviderName);
        let p: IProvider | undefined
        if (currentProviderName && (p = getProviderByName(currentProviderName))) {
            setCurrentProvider(p)
            setEditProviderName(p.name)
            setEditProviderApiUrl(p.apiUrl)
            setEditProviderApiKey(p.apiKey)
        }
    }, [currentProviderName, providers])
    useEffect(() => {
        setmsConfig(JSON.stringify(mcpServerConfig, null, 2))
    }, [mcpServerConfig])

    const onAddModelClick = () => {
        // console.log('onAddModelClick currentProvider=', currentProvider);
        if (!currentProvider) return
        const newModel: IModel = {
            enable: true, 
            provider: currentProvider.name, 
            name: nextAddModelLabel, 
            value: nextAddModelValue, 
            type: nextAddModelType || 'llm'
        }
        
        addModel(currentProvider.name, newModel)

        setNextAddModelEnable(false)
        setNextAddModelLabel('')
        setNextAddModelValue('')
        setNextAddModelType('')
    }
    const onNextAddModelEnableChange = (val) => {
        setNextAddModelEnable(val)
    }
    const saveConfigurationClick = (): void => {
        console.log('saveConfigurationClick', editProviderName, editProviderApiUrl, editProviderApiKey)
        console.log('saveConfigurationClick mcpServerConfig', mcpServerConfig)

        if (currentProvider) {
            // Update provider with new values
            updateProvider(currentProvider.name, {
                name: editProviderName,
                apiUrl: editProviderApiUrl,
                apiKey: editProviderApiKey
            })

            console.log('updatedProvider', {
                name: editProviderName,
                apiUrl: editProviderApiUrl,
                apiKey: editProviderApiKey
            })
            
            // If provider name changed, update current provider reference
            if (editProviderName !== currentProvider.name) {
                setCurrentProviderName(editProviderName)
            }
        }
        
        const updatedAppConfig = {
            ...appConfig,
            providers: providers,
            tools: {
                ...appConfig.tools,
                titleGenerateModel: titleGenerateModel,
                titleGenerateEnabled: titleGenerateEnabled
            },
            mcp: {
                ...JSON.parse(msConfig)
            }
        }

        setAppConfig(updatedAppConfig)

        sonnerToast.success('Save configurations success')
    }
    const onAddProviderBtnClick = e => {
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

        sonnerToast.success(`Added ${newProviderName}`)
    }
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
    const onModelTableCellClick = (val: string) => {
        navigator.clipboard.writeText(val)
        sonnerToast(`✅ Copied`)
    }
    const onProviderCardClick = (p: IProvider) => {
        setCurrentProviderName(p.name)
    }
    const onModelEnableStatusChange = (checked, model: IModel) => {
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
    const toggleEnableAllModels = (checked: boolean) => {
        const updatedModels = currentProvider?.models.map(m => {
            m.enable = checked
            return m
        })
        // console.log('updatedModels', updatedModels)
        updateProvider(currentProvider?.name!, {
            ...currentProvider,
            models: updatedModels
        })
    }
    
    // 计算全选checkbox的状态
    const getAllModelsCheckedState = () => {
        const models = currentProvider?.models || []
        if (models.length === 0) return false
        return models.every(m => m.enable)
    }
    const onMcpServerConfigChange = e => {
        try {
            const config = e.target.value
            console.log(config)
            // console.log(JSON.parse(config))
            setmsConfig(config)
            setMcpServerConfig(JSON.parse(config))
            sonnerToast.success('All syntax right.')
        } catch(error: any) {
            sonnerToast.error(error.message)
        }
    }
    const onProviderCardHover = (idx) => {
        setHoverProviderCardIdx(idx)
    }
    const onProviderCardDelClick = (_, provider: IProvider) => {
        if(currentProvider && currentProvider.name === provider.name) {
            setCurrentProvider(undefined)
        }
        if(currentProviderName && currentProviderName === provider.name) {
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
    // TabsTrigger 公共样式
    const tabsTriggerClassName = cn(
        "px-4 py-1.5 text-sm font-medium rounded-md relative z-10",
        "transition-all duration-200 ease-out",
        "text-gray-600 dark:text-gray-400",
        "hover:text-gray-900 dark:hover:text-gray-200",
        "hover:bg-transparent",
        "data-[state=active]:text-gray-900 dark:data-[state=active]:text-gray-100",
        "data-[state=active]:font-semibold",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
    )

    return (
        <div className="grid gap-4">
            <div className="space-y-2 select-none">
                <h4 className="font-medium leading-none space-x-2 text-gray-900 dark:text-gray-100">
                    <span>@i</span>
                    <Badge variant="secondary" className='bg-slate-100 dark:bg-slate-800 text-gray-800 dark:text-gray-200'>{appVersion}</Badge>
                </h4>
                <p className="text-sm text-muted-foreground dark:text-gray-400">Set the preferences for @i</p>
            </div>
            <Tabs value={activeTab} onValueChange={setActiveTab} defaultValue="provider-list">
                <div className="flex items-center justify-between mb-2">
                    <TabsList 
                        ref={tabsListRef}
                        className={cn(
                            "bg-gray-100 dark:bg-gray-800",
                            "p-1 rounded-lg",
                            "inline-flex h-10 items-center justify-center",
                            "shadow-sm border border-gray-200/50 dark:border-gray-700/50",
                            "relative"
                        )}
                    >
                        {/* 滑动指示器 */}
                        {indicatorStyle.width > 0 && (
                            <div
                                className={cn(
                                    "absolute bottom-1 top-1 rounded-md",
                                    "bg-white dark:bg-gray-700",
                                    "shadow-sm",
                                    "transition-all duration-300 ease-out",
                                    "z-0"
                                )}
                                style={{
                                    left: `${indicatorStyle.left}px`,
                                    width: `${indicatorStyle.width}px`,
                                }}
                            />
                        )}
                        
                        <TabsTrigger 
                            ref={(el) => { tabRefs.current['provider-list'] = el }}
                            value="provider-list" 
                            className={tabsTriggerClassName}
                        >
                            Providers
                        </TabsTrigger>
                        <TabsTrigger 
                            ref={(el) => { tabRefs.current['tool'] = el }}
                            value="tool" 
                            className={tabsTriggerClassName}
                        >
                            Tool
                        </TabsTrigger>
                        <TabsTrigger 
                            ref={(el) => { tabRefs.current['mcp-server'] = el }}
                            value="mcp-server" 
                            className={tabsTriggerClassName}
                        >
                            MCP Server
                        </TabsTrigger>
                    </TabsList>
                    <div className="flex items-end gap-2">
                        <p className='text-xs text-orange-400 dark:text-orange-300 select-none'>Remember to save changes</p>
                        <Button size="xs" onClick={saveConfigurationClick} className="shadow-sm">
                            <i className="ri-save-line mr-1.5"></i>
                            Save
                        </Button>
                    </div>
                </div>
                <TabsContent value="provider-list" className='w-[700px] h-[600px] focus:ring-0 focus-visible:ring-0'>
                    <div className='flex h-full bg-gray-50 dark:bg-gray-900 p-2 rounded-md gap-2'>
                        <div className='w-1/4 flex flex-col bg-white dark:bg-gray-800 rounded-md shadow-sm overflow-hidden'>
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
                                        <div className='flex items-center justify-center gap-2 py-2'>
                                            <i className={cn(
                                                "ri-add-circle-line text-xl transition-all duration-200 ease-out",
                                                "group-hover:scale-110 group-hover:rotate-90"
                                            )}></i>
                                            <span className='text-sm font-medium transition-colors duration-200'>Add Provider</span>
                                        </div>
                                    </DrawerTrigger>
                                    <DrawerContent>
                                        <DrawerHeader>
                                            <DrawerTitle>Add new provider</DrawerTitle>
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
                                {
                                    providers.map((p, idx) => (
                                        <div
                                            key={idx}
                                            className={cn(
                                                'flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer select-none relative group',
                                                'transition-all duration-200 ease-out',
                                                p.name === currentProviderName
                                                    ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-500 shadow-sm'
                                                    : 'hover:bg-gray-100 dark:hover:bg-gray-700 hover:shadow-sm hover:scale-[1.02]'
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
                                                    "w-5 h-5 flex-none dark:invert dark:brightness-90 transition-transform duration-200",
                                                    hoverProviderCardIdx === idx && "scale-110"
                                                )} 
                                            />
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <p className='truncate font-medium text-sm text-gray-700 dark:text-gray-300 flex-1 transition-colors duration-200'>
                                                            {p.name}
                                                        </p>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>{p.name}</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                            <div
                                                className={cn(
                                                    'absolute -top-1 -right-1 transition-all duration-200 ease-out cursor-pointer z-10',
                                                    hoverProviderCardIdx === idx
                                                        ? 'opacity-100 scale-100 translate-x-0 translate-y-0'
                                                        : 'opacity-0 scale-75 translate-x-1 -translate-y-1 pointer-events-none'
                                                )}
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    onProviderCardDelClick(idx, p)
                                                }}
                                            >
                                                <Cross1Icon className="rounded-full bg-red-500 text-white p-1 w-5 h-5 shadow-lg transition-all duration-200 hover:bg-red-600 hover:scale-110 hover:rotate-90 active:scale-95" />
                                            </div>
                                        </div>
                                    ))
                                }
                            </div>
                        </div>
                        <div className='w-3/4 px-1 pt-1 flex flex-col h-full'>
                            <div className='flex-none flex flex-col space-y-1 mb-2 bg-white dark:bg-gray-800 p-2 rounded-md shadow-sm'>
                                <Label>
                                    <p className='pl-1 pb-0.5 text-gray-400 dark:text-gray-500 text-xs'>Provider Name</p>
                                    <Input className='w-full h-9 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 focus-visible:ring-0 focus-visible:ring-offset-0' placeholder='provider name' value={editProviderName}
                                        onChange={(e) => {
                                            setEditProviderName(e.target.value)
                                            setCurrentProviderName(e.target.value)
                                            updateCurrentProvider('name', e.target.value)
                                        }}
                                    />
                                </Label>
                                <Label>
                                    <p className='pl-1 pb-0.5 text-gray-400 dark:text-gray-500 text-xs'>API Url</p>
                                    <Input className='w-full h-9 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 focus-visible:ring-0 focus-visible:ring-offset-0' placeholder='api url' value={editProviderApiUrl}
                                        onChange={(e) => {
                                            setEditProviderApiUrl(e.target.value)
                                            updateCurrentProvider('apiUrl', e.target.value)
                                        }}
                                    />
                                </Label>
                                <Label>
                                    <p className='pl-1 pb-0.5 text-gray-400 dark:text-gray-500 text-xs'>API Key</p>
                                    <Input className='w-full h-9 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 focus-visible:ring-0 focus-visible:ring-offset-0' placeholder='api key' value={editProviderApiKey}
                                        onChange={(e) => {
                                            setEditProviderApiKey(e.target.value)
                                            updateCurrentProvider('apiKey', e.target.value)
                                        }}
                                    />
                                </Label>
                            </div>
                            <div className='flex-1 overflow-hidden bg-white dark:bg-gray-800 rounded-md shadow-sm'>
                                <div className='h-full overflow-y-auto scroll-smooth relative'>
                                    <TooltipProvider>
                                        <Table id="provider-models-table" className='relative'>
                                            {/* <TableHeader className='text-sm select-none sticky top-0 bg-white z-20 shadow-sm'>
                                                <TableRow className='border-b border-gray-200'>
                                                    <TableHead className='text-center flex items-center space-x-1 h-10 py-2 bg-white'><Checkbox checked={getAllModelsCheckedState()} onCheckedChange={toggleEnableAllModels} /><span>Enable</span></TableHead>
                                                    <TableHead className='text-center h-10 py-2 bg-white'>Label</TableHead>
                                                    <TableHead className='text-center h-10 py-2 bg-white'>Value</TableHead>
                                                    <TableHead className='text-center h-10 py-2 bg-white'>Type</TableHead>
                                                    <TableHead className='text-center h-10 py-2 bg-white'>Operation</TableHead>
                                                </TableRow>
                                            </TableHeader> */}
                                            <TableBody>
                                                <TableRow className='border-b dark:border-gray-700 w-full'>
                                                    <TableCell className='py-2'><Input className='focus-visible:ring-transparent focus-visible:ring-offset-0 h-8 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200' value={nextAddModelLabel} onChange={e => setNextAddModelLabel(e.target.value)} placeholder="Name" /></TableCell>
                                                    <TableCell className='py-2'><Input className='focus-visible:ring-transparent focus-visible:ring-offset-0 h-8 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200' value={nextAddModelValue} onChange={e => setNextAddModelValue(e.target.value)} placeholder="ModelID" /></TableCell>
                                                    <TableCell className='py-2'>
                                                        <Select value={nextAddModelType} onValueChange={setNextAddModelType}>
                                                            <SelectTrigger className="h-8 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200">
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
                                                    <TableCell className='text-center py-2'><Button onClick={onAddModelClick} size={'xs'} variant={'outline'}><i className="ri-add-circle-line text-lg">&nbsp;</i>Add</Button></TableCell>
                                                    <TableCell className='py-2'></TableCell>
                                                </TableRow>
                                                {
                                                    providers.find(p => p.name === currentProviderName)?.models.map((m, idx) => (
                                                        <TableRow key={idx} className={cn('border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors', idx % 2 === 0 ? 'bg-blue-gray-50/50 dark:bg-gray-800/50' : 'bg-white dark:bg-gray-800')}>
                                                            <TableCell className='text-left max-w-0 py-2 cursor-pointer' onClick={_ => onModelTableCellClick(m.name)}>
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <p className='truncate text-sm text-gray-700 dark:text-gray-300'>{m.name}</p>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent>
                                                                        <p>{m.name}</p>
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                            </TableCell>
                                                            <TableCell className='text-left max-w-0 py-2 cursor-pointer' onClick={_ => onModelTableCellClick(m.value)}>
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <p className='truncate text-sm text-gray-700 dark:text-gray-300'>{m.value}</p>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent>
                                                                        <p>{m.value}</p>
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                            </TableCell>
                                                            <TableCell className='text-center py-2 text-sm cursor-pointer text-gray-700 dark:text-gray-300'>{m.type}</TableCell>
                                                            {/* <TableCell className='text-center py-2'>
                                                                <DropdownMenu>
                                                                    <DropdownMenuTrigger asChild>
                                                                        <Button variant="outline" size='xs' className='rounded-lg h-7'><SquarePen className='w-3'></SquarePen></Button>
                                                                    </DropdownMenuTrigger>
                                                                    <DropdownMenuContent className="w-auto" align="start">
                                                                        <DropdownMenuItem>Edit</DropdownMenuItem>
                                                                        <DropdownMenuSeparator />
                                                                        <DropdownMenuItem onClick={_ => onModelDelClick(m)} className='text-red-300 focus:text-red-400'>Delete</DropdownMenuItem>
                                                                    </DropdownMenuContent>
                                                                </DropdownMenu>
                                                            </TableCell> */}
                                                            {/* <TableCell className='py-2'><Checkbox checked={m.enable} onCheckedChange={checked => onModelEnableStatusChange(checked, m)}/></TableCell> */}
                                                            <TableCell className='py-2'><Switch className={'h-6'} checked={m.enable} onCheckedChange={checked => onModelEnableStatusChange(checked, m)}/></TableCell>
                                                            <TableCell className='py-2'><Trash className='w-4 h-4 text-red-400 cursor-pointer' onClick={_ => onModelDelClick(m)}/></TableCell>
                                                        </TableRow>
                                                    ))
                                                }
                                            </TableBody>
                                        </Table>
                                    </TooltipProvider>
                                </div>
                            </div>
                        </div>
                    </div>
                </TabsContent>
                {/* <TabsContent value="providers" className='w-[640px] h-[600px] focus:ring-0 focus-visible:ring-0'>
                    <div ref={providerCardRef} className="m-2 h-20 overflow-scroll scroll-smooth no-scrollbar">
                        <div className={cn('select-none h-20 flex space-x-2 relative', providers.length === 0 ? 'flex justify-center' : '')}>
                            <div className={cn('bg-gray-100 rounded-md flex-none w-24 h-20')}>
                                <Drawer>
                                    <DrawerTrigger className='text-gray-400 flex justify-center items-center bg-gray-100 rounded-xl h-full w-full'>
                                        <p className='text-5xl'><i className="ri-add-circle-line"></i></p>
                                    </DrawerTrigger>
                                    <DrawerContent>
                                        <DrawerHeader>
                                            <DrawerTitle>Add new provider</DrawerTitle>
                                        </DrawerHeader>
                                        <DrawerFooter>
                                            <div id='add-new-provider-drawer' className="grid gap-4 app-undragable">
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex flex-col items-start gap-2">
                                                        <Label htmlFor="name">Name</Label>
                                                        <Input
                                                            id="name"
                                                            placeholder="OpenAI"
                                                            className="focus-visible:ring-transparent focus-visible:ring-offset-0 w-full h-10"
                                                            onChange={e => { setNewProviderName(e.target.value) }}
                                                        />
                                                    </div>
                                                    <div className="flex flex-col items-start gap-2">
                                                        <Label htmlFor="apiUrl">API URL</Label>
                                                        <Input
                                                            id="apiUrl"
                                                            placeholder="https://api.openai.com/v1/chat/completions"
                                                            className="focus-visible:ring-transparent focus-visible:ring-offset-0 w-full h-10"
                                                            onChange={e => { setNewProviderApi(e.target.value) }}
                                                        />
                                                    </div>
                                                    <div className="flex flex-col items-start gap-2">
                                                        <Label htmlFor="apiKey">API Key</Label>
                                                        <Input
                                                            id="apiKey"
                                                            placeholder="sk-********"
                                                            className="focus-visible:ring-transparent focus-visible:ring-offset-0 w-full h-10"
                                                            onChange={e => { setNewProviderApiKey(e.target.value) }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                            <DrawerTrigger asChild>
                                                <Button onClick={onAddProviderBtnClick}>Save</Button>
                                            </DrawerTrigger>
                                            <DrawerClose asChild>
                                                <Button variant="outline">Cancel</Button>
                                            </DrawerClose>
                                        </DrawerFooter>
                                    </DrawerContent>
                                </Drawer>
                            </div>
                            {
                                providers.map((fProvider, idx) => (
                                    <div key={fProvider.name} className='relative' onMouseEnter={_ => onProviderCardHover(idx)}>
                                        {
                                            hoverProviderCardIdx === idx && (
                                                <div className='absolute top-0 right-0' onClick={_ => onProviderCardDelClick(idx)}>
                                                    <Cross1Icon className="rounded-full bg-red-500 text-white p-1 w-5 h-5 transition-all duration-300 ease-in-out hover:transform hover:rotate-180" />
                                                </div>
                                            )
                                        }
                                        <div ref={idx === providers.length - 1 ? theEndProviderCardRef : null} className='flex flex-col justify-center items-center bg-gray-100 rounded w-24 h-20 select-none' onClick={_ => onProviderCardClick(fProvider)}>
                                            {getIcon(fProvider.name)}
                                            <p className='select-none'>{fProvider.name}</p>
                                        </div>
                                    </div>
                                ))
                            }
                        </div>
                    </div>
                    <div className='h-[84%] flex flex-col mt-2 pl-2 pr-2'>
                        <div className='flex-none h-14 pl-1 pr-1 space-x-2 flex justify-center items-center'>
                            <Label className='flex-none' htmlFor="provider">Provider</Label>
                            <Input id="provider" 
                                className='focus-visible:ring-transparent focus-visible:ring-offset-0 flex-grow' 
                                value={editProviderName}
                                placeholder="Custom provider name"
                                onChange={(e) => {
                                    setEditProviderName(e.target.value)
                                    setCurrentProviderName(e.target.value)
                                    updateCurrentProvider('name', e.target.value)
                                }}
                                />
                        </div>
                        <div className='flex-none h-14 pl-1 pr-1 space-x-2 flex justify-center items-center'>
                            <Label className='flex-none' htmlFor="provider">ApiUrl&emsp;</Label>
                            <Input id="provider" 
                                className='focus-visible:ring-transparent focus-visible:ring-offset-0 flex-grow'
                                value={editProviderApiUrl}
                                placeholder="https://provider-api.com/v1/chat/x"
                                onChange={(e) => {
                                    setEditProviderApiUrl(e.target.value)
                                    updateCurrentProvider('apiUrl', e.target.value)
                                }}
                                />
                        </div>
                        <div className='flex-none h-14 pl-1 pr-1 space-x-2 flex justify-center items-center'>
                            <Label className='flex-none' htmlFor="provider">ApiKey&ensp;</Label>
                            <Input id="provider" 
                                className='focus-visible:ring-transparent focus-visible:ring-offset-0 flex-grow'
                                placeholder="Custom API key"
                                value={editProviderApiKey}
                                onChange={(e) => {
                                    setEditProviderApiKey(e.target.value)
                                    updateCurrentProvider('apiKey', e.target.value)
                                }}
                                />
                        </div>
                        <div className='flex-grow overflow-scroll'>
                            <Table>
                                <TableHeader className=''>
                                    <TableRow>
                                        <TableHead className='text-center flex items-center space-x-1'><Checkbox checked={getAllModelsCheckedState()} onCheckedChange={toggleEnableAllModels} /><span>Enable</span></TableHead>
                                        <TableHead className='text-center'>DisplayName</TableHead>
                                        <TableHead className='text-center'>Value</TableHead>
                                        <TableHead className='text-center'>Type</TableHead>
                                        <TableHead className='text-center'>Operation</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    <TableRow>
                                        <TableCell><Checkbox checked={nextAddModelEnable} onCheckedChange={onNextAddModelEnableChange} /></TableCell>
                                        <TableCell><Input className='focus-visible:ring-transparent focus-visible:ring-offset-0 h-8' value={nextAddModelLabel} onChange={e => setNextAddModelLabel(e.target.value)} /></TableCell>
                                        <TableCell><Input className='focus-visible:ring-transparent focus-visible:ring-offset-0 h-8' value={nextAddModelValue} onChange={e => setNextAddModelValue(e.target.value)} /></TableCell>
                                        <TableCell>
                                            <Select value={nextAddModelType} onValueChange={setNextAddModelType}>
                                                <SelectTrigger className="h-8">
                                                    <SelectValue placeholder="Type" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectGroup>
                                                        <SelectItem value="llm">LLM</SelectItem>
                                                        <SelectItem value="vlm">VLM</SelectItem>
                                                    </SelectGroup>
                                                </SelectContent>
                                            </Select>
                                        </TableCell>
                                        <TableCell className='text-center'><Button onClick={onAddModelClick} size={'xs'} variant={'outline'}><i className="ri-add-circle-line text-lg"></i></Button></TableCell>
                                    </TableRow>
                                    {
                                        providers.find(p => p.name === currentProviderName)?.models.map((m, idx) => (
                                            <TableRow key={idx}>
                                                <TableCell><Checkbox checked={m.enable} onCheckedChange={checked => onModelEnableStatusChange(checked, m)}/></TableCell>
                                                <TableCell className='text-left' onClick={_ => onModelTableCellClick(m.name)}>{m.name}</TableCell>
                                                <TableCell className='text-left' onClick={_ => onModelTableCellClick(m.value)}>{m.value}</TableCell>
                                                <TableCell className='text-center'>{m.type}</TableCell>
                                                <TableCell className='text-left'></TableCell>
                                            </TableRow>
                                        ))
                                    }
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </TabsContent> */}
                <TabsContent value="tool" className='w-[700px] min-h-96 space-y-3 focus:ring-0 focus-visible:ring-0'>
                    <div className='w-full space-y-3'>
                        {/* Title Generation Setting */}
                        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 shadow-sm p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-start gap-4">
                                <Checkbox
                                    checked={titleGenerateEnabled}
                                    onCheckedChange={_ => setTitleGenerateEnabled(!titleGenerateEnabled)}
                                    id="toggle-title-generation"
                                    className="mt-1"
                                />
                                <div className="flex-1 space-y-3">
                                    <div className="space-y-1">
                                        <Label htmlFor="toggle-title-generation" className="text-sm font-semibold text-gray-900 dark:text-gray-100 cursor-pointer">
                                            Title Generation
                                        </Label>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            Automatically generate conversation titles based on content
                                        </p>
                                    </div>
                                    <div className="app-undragable">
                                        <Label className="text-xs text-gray-600 dark:text-gray-400 mb-1.5 block">Model Selection</Label>
                                        <Popover open={selectTitleModelPopoutState} onOpenChange={setSelectTitleModelPopoutState}>
                                            <PopoverTrigger disabled={!titleGenerateEnabled} asChild>
                                                <Button
                                                    variant="outline"
                                                    role="combobox"
                                                    aria-expanded={selectTitleModelPopoutState}
                                                    className={cn(
                                                        "w-full justify-between",
                                                        !titleGenerateEnabled && "opacity-50 cursor-not-allowed"
                                                    )}
                                                >
                                                    <span className="truncate">
                                                        {titleGenerateModel ? titleGenerateModel.name : "Select model..."}
                                                    </span>
                                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-full p-0">
                                                <Command>
                                                    <CommandInput placeholder="Search model..." className="h-9" />
                                                    <CommandList>
                                                        <CommandEmpty>No model found.</CommandEmpty>
                                                        <CommandGroup>
                                                            {models.map((md, idx) => (
                                                                <CommandItem
                                                                    key={idx}
                                                                    value={(md.name as string).concat('/').concat(md.provider)}
                                                                    onSelect={(_) => {
                                                                        setSelectTitleModelPopoutState(false)
                                                                        setTitleGenerateModel(md)
                                                                    }}
                                                                >
                                                                    {(md.name as string).concat('@').concat(md.provider)}
                                                                    <Check className={cn("ml-auto h-4 w-4", titleGenerateModel && titleGenerateModel.value === md.value && titleGenerateModel.provider === md.provider ? "opacity-100" : "opacity-0")} />
                                                                </CommandItem>
                                                            ))}
                                                        </CommandGroup>
                                                    </CommandList>
                                                </Command>
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* WebSearch Items Setting */}
                        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 shadow-sm p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex-1 space-y-1">
                                    <Label className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                        WebSearch Items
                                    </Label>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        Number of search results to fetch. The more items means more tokens use and longer times waiting.
                                    </p>
                                </div>
                                <div className="w-24">
                                    <Input
                                        className='focus-visible:ring-transparent focus-visible:ring-offset-0 text-center px-0 h-8 w-14 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200'
                                        defaultValue={3}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </TabsContent>
                <TabsContent value="mcp-server" className='w-[700px] h-[600px] overflow-scroll space-y-1 rounded-md focus:ring-0 focus-visible:ring-0'>
                    <CodeEditor
                        value={msConfig}
                        language="json"
                        placeholder="Please enter JSON code."
                        onChange={(e) => onMcpServerConfigChange(e)}
                        className="dark:bg-gray-900"
                        style={{
                            backgroundColor: "#f5f5f5",
                            fontFamily: 'ui-monospace,SFMono-Regular,SF Mono,Consolas,Liberation Mono,Menlo,monospace',
                        }}
                        data-color-mode="auto"
                        />
                </TabsContent>
            </Tabs>
        </div>
    )
}

export default PreferenceComponent

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@renderer/components/ui/tabs"
import { cn } from '@renderer/lib/utils'
import React, { useEffect, useRef, useState } from 'react'

import { Badge } from '@renderer/components/ui/badge'
import { Button } from "@renderer/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@renderer/components/ui/command'
import { Drawer, DrawerClose, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from '@renderer/components/ui/drawer'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
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
import { useChatStore } from '@renderer/store'
import { Check, ChevronsUpDown, Trash } from "lucide-react"
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
import CodeEditor from '@uiw/react-textarea-code-editor'

interface PreferenceProps { }

const PreferenceComponent: React.FC<PreferenceProps> = () => {

    const {
        appVersion,
        appConfig,
        setAppConfig,
        models,
        providers,
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


        setNextAddModelLabel('')
        setNextAddModelValue('')
        setNextAddModelType('')
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

        toast.success('Save configurations success')
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
    // const _toggleEnableAllModels = (checked: boolean) => {
    //     const updatedModels = currentProvider?.models.map(m => {
    //         m.enable = checked
    //         return m
    //     })
    //     // console.log('updatedModels', updatedModels)
    //     updateProvider(currentProvider?.name!, {
    //         ...currentProvider,
    //         models: updatedModels
    //     })
    // }
    // 计算全选checkbox的状态
    // const _getAllModelsCheckedState = () => {
    //     const models = currentProvider?.models || []
    //     if (models.length === 0) return false
    //     return models.every(m => m.enable)
    // }
    const onMcpServerConfigChange = (e: any) => {
        try {
            const config = e.target.value
            console.log(config)
            // console.log(JSON.parse(config))
            setmsConfig(config)
            setMcpServerConfig(JSON.parse(config))
            toast.success('All syntax right.')
        } catch (error: any) {
            toast.error(error.message)
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
                                                <Cross1Icon className={cn(
                                                    'rounded-full p-1 w-5 h-5 shadow-lg transition-all duration-200 hover:scale-110 hover:rotate-90 active:scale-95',
                                                    'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
                                                    'hover:bg-red-200 dark:hover:bg-red-900/50'
                                                )} />
                                            </div>
                                        </div>
                                    ))
                                }
                            </div>
                        </div>
                        <div id="providerDetails" className='w-3/4 flex flex-col h-full gap-3 px-2 pt-2'>
                            {/* Provider 配置表单区域 */}
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
                                            API Url
                                        </Label>
                                        <Input
                                            id="provider-api-url"
                                            className='h-10 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-0 transition-all'
                                            placeholder='https://api.example.com/v1/chat/completions'
                                            value={editProviderApiUrl}
                                            onChange={(e) => {
                                                setEditProviderApiUrl(e.target.value)
                                                updateCurrentProvider('apiUrl', e.target.value)
                                            }}
                                        />
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

                            {/* Models 列表区域 */}
                            <div className='flex-1 flex justify-between flex-col overflow-hidden bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200/50 dark:border-gray-700/50'>
                                <div className='flex justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50'>
                                    <h3 className='text-sm font-medium flex items-center text-gray-700 dark:text-gray-300'>Models</h3>
                                    <Button size="xs" variant="outline" className='text-xs text-gray-400 font-medium transition-all' onClick={() => { toast.warning('Not implemented yet') }}>Fetch Models</Button>
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
                                                {/* 添加新模型行 */}
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
                                                            className='h-9 px-4 shadow-sm hover:shadow-md transition-all'
                                                        >
                                                            <i className="ri-add-circle-line mr-1.5"></i>
                                                            Add
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                                {/* 模型列表 */}
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
                                                {/* 空状态提示 */}
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
                </TabsContent>
                <TabsContent value="tool" className='w-[700px] h-[600px] focus:ring-0 focus-visible:ring-0'>
                    <div className='w-full space-y-4 p-1'>
                        {/* Title Generation Setting */}
                        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md">
                            <div className="p-5 flex items-start gap-4">
                                <div className="flex-1 space-y-1">
                                    <div className="flex items-center gap-2">
                                        <Label htmlFor="toggle-title-generation" className="text-base font-medium text-gray-900 dark:text-gray-100">
                                            Title Generation
                                        </Label>
                                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
                                            AI
                                        </Badge>
                                    </div>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                                        Automatically analyze conversation context and generate concise, meaningful titles using AI models.
                                    </p>
                                </div>
                                <Switch
                                    checked={titleGenerateEnabled}
                                    onCheckedChange={setTitleGenerateEnabled}
                                    id="toggle-title-generation"
                                    className="data-[state=checked]:bg-blue-600 mt-1"
                                />
                            </div>

                            {/* Model Selection Area - Conditionally rendered with animation */}
                            <div className={cn(
                                "grid transition-all duration-300 ease-in-out bg-gray-50/50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-700/50",
                                titleGenerateEnabled ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                            )}>
                                <div className="overflow-hidden">
                                    <div className="p-4 pt-3 flex items-center justify-between gap-4">
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider pl-1">Target Model</span>
                                        <Popover open={selectTitleModelPopoutState} onOpenChange={setSelectTitleModelPopoutState}>
                                            <PopoverTrigger disabled={!titleGenerateEnabled} asChild>
                                                <Button
                                                    variant="outline"
                                                    role="combobox"
                                                    aria-expanded={selectTitleModelPopoutState}
                                                    className="w-[300px] justify-between bg-white dark:bg-gray-800 h-9 text-sm"
                                                >
                                                    <div className="flex items-center gap-2 truncate">
                                                        <span className="truncate font-medium">
                                                            {titleGenerateModel ? titleGenerateModel.name : "Select model..."}
                                                        </span>
                                                        {titleGenerateModel && (
                                                            <span className="text-xs text-gray-400 font-mono">
                                                                {titleGenerateModel.provider}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-[300px] p-0" align="end">
                                                <Command>
                                                    <CommandInput placeholder="Search model..." className="h-9" />
                                                    <CommandList>
                                                        <CommandEmpty>No model found.</CommandEmpty>
                                                        <CommandGroup className="max-h-[300px] overflow-y-auto">
                                                            {models.map((md, idx) => (
                                                                <CommandItem
                                                                    key={idx}
                                                                    value={(md.name as string).concat('/').concat(md.provider)}
                                                                    onSelect={(_) => {
                                                                        setSelectTitleModelPopoutState(false)
                                                                        setTitleGenerateModel(md)
                                                                    }}
                                                                    className="cursor-pointer"
                                                                >
                                                                    <div className="flex flex-col">
                                                                        <span>{md.name}</span>
                                                                        <span className="text-[10px] text-gray-400">{md.provider}</span>
                                                                    </div>
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
                        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5 hover:shadow-md transition-all duration-200">
                            <div className="flex items-center justify-between gap-6">
                                <div className="flex-1 space-y-1">
                                    <div className="flex items-center gap-2">
                                        <Label className="text-base font-medium text-gray-900 dark:text-gray-100">
                                            Web Search Limit
                                        </Label>
                                    </div>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                                        Max number of search results to process (1-10). Higher values provide more context but increase token usage and latency.
                                    </p>
                                </div>
                                <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-900 rounded-lg p-1.5 border border-gray-200 dark:border-gray-700">
                                    <Input
                                        className='focus-visible:ring-transparent focus-visible:ring-offset-0 text-center px-0 h-8 w-16 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm transition-all focus:w-20 font-mono font-medium'
                                        defaultValue={3}
                                    />
                                    <span className="text-xs font-medium text-gray-400 pr-2">items</span>
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
                        padding={15}
                        data-color-mode="dark"
                    />
                </TabsContent>
            </Tabs>
        </div>
    )
}

export default PreferenceComponent

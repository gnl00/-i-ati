import React, { useEffect, useRef, useState } from 'react'
import { Cross1Icon } from "@radix-ui/react-icons"
import { cn } from '@renderer/lib/utils'
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
import { Check, ChevronsUpDown, SquarePen } from "lucide-react"
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

    const providerCardRef = useRef<HTMLDivElement>(null)
    const theEndProviderCardRef = useRef<HTMLDivElement>(null)
    
    useEffect(() => {
        setEditProviderName('')
        setEditProviderApiUrl('')
        setEditProviderApiKey('')
    }, [])
    useEffect(() => {
        if (currentProviderName) {
            const p = getProviderByName(currentProviderName)!
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
        console.log('onAddModelClick currentProvider=', currentProvider);
        
        if (!currentProvider) return
        
        const newModel: IModel = {
            enable: nextAddModelEnable, 
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
    const onDelProviderBtnClick = (e, providerName) => {
        e.preventDefault()
        e.stopPropagation()
        removeProvider(providerName)
    }
    const getIcon = (provider: string) => {
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
        return <img draggable={false} src={iconSrc} alt="OpenAI" className="w-14 h-14" />
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
    const onProviderCardDelClick = (idx) => {
        console.log('onProviderCardDelClick', idx)
        setProviders(providers.filter((_, i) => i !== idx))
    }
    return (
        <div className="grid gap-4">
            <div className="space-y-2 select-none">
                <h4 className="font-medium leading-none space-x-2">
                    <span>@i</span>
                    <Badge variant="secondary" className='bg-slate-100 text-gray-800'>{appVersion}</Badge>
                </h4>
                <p className="text-sm text-muted-foreground">Set the preferences for @i</p>
            </div>
            <Tabs defaultValue="provider-list">
                <TabsList>
                    <TabsTrigger value="provider-list">Providers</TabsTrigger>
                    <TabsTrigger value="tool">Tool</TabsTrigger>
                    <TabsTrigger value="mcp-server">MCP Server</TabsTrigger>
                </TabsList>
                <TabsContent value="provider-list" className='w-[670px] h-[600px] focus:ring-0 focus-visible:ring-0'>
                    <div className='flex h-full bg-gray-50 p-1 rounded-md'>
                        <div className='w-1/4 flex flex-col overflow-scroll scroll-smooth relative'>
                            <div className={cn('bg-gray-100 rounded-md')}>
                                <Drawer>
                                    <DrawerTrigger className='text-gray-400 flex justify-center items-center bg-gray-100 rounded-xl h-full w-full'>
                                        <p id='add-new-provider' className='sticky bottom-0 w-full h-14 bg-gray-50 rounded-md flex justify-center items-center'>
                                            <span className='bg-gray-200 w-full h-full flex justify-center items-center mx-1 my-1 rounded-md text-gray-600 text-2xl hover:bg-black/5 hover:text-gray-400'><i className="ri-add-circle-line"></i></span>
                                        </p>
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
                                providers.map((p, idx) => (
                                    <div key={idx} className='flex flex-col pl-1 py-0.5 justify-center items-center select-none' onMouseEnter={_ => onProviderCardHover(idx)} onMouseLeave={_ => onProviderCardHover(-1)} onClick={_ => onProviderCardClick(p)}>
                                        <p className='flex items-center bg-gray-100 hover:bg-blue-gray-200 rounded-md w-full py-2 px-1 text-gray-700 space-x-2 relative'>
                                            <img draggable={false} src={getIconSrc(p.name)} alt="OpenAI" className="w-5 h-5" />
                                            <span>{p.name}</span>
                                            {
                                                hoverProviderCardIdx === idx && (
                                                    <div className='absolute top-0 right-0' onClick={_ => onProviderCardDelClick(idx)}>
                                                        <Cross1Icon className="rounded-full bg-red-400 text-white p-0.5 w-4 h-4 transition-all duration-300 ease-in-out hover:transform hover:rotate-180" />
                                                    </div>
                                                )
                                            }
                                        </p>
                                    </div>
                                ))
                            }
                        </div>
                        <div className='w-3/4 px-1 pt-1 flex flex-col'>
                            <div className='flex flex-col space-y-1 mb-1'>
                                <Label>
                                    <p className='pl-1 pb-0.5 text-gray-400'>Provider Name</p>
                                    <Input className='w-full' placeholder='provider name' value={editProviderName} 
                                        onChange={(e) => {
                                            setEditProviderName(e.target.value)
                                            setCurrentProviderName(e.target.value)
                                            updateCurrentProvider('name', e.target.value)
                                        }}
                                    />
                                </Label>
                                <Label>
                                    <p className='pl-1 pb-0.5 text-gray-400'>ApiUrl</p>
                                    <Input className='w-full' placeholder='api url' value={editProviderApiUrl}
                                        onChange={(e) => {
                                            setEditProviderApiUrl(e.target.value)
                                            updateCurrentProvider('apiUrl', e.target.value)
                                        }}
                                    />
                                </Label>
                                <Label>
                                    <p className='pl-1 pb-0.5 text-gray-400'>ApiKey</p>
                                    <Input className='w-full' placeholder='api key' value={editProviderApiKey}
                                        onChange={(e) => {
                                            setEditProviderApiKey(e.target.value)
                                            updateCurrentProvider('apiKey', e.target.value)
                                        }}
                                    />
                                </Label>
                            </div>
                            <Table id="provider-models-table" className='relative'>
                                <TableHeader className='text-sm select-none sticky top-0 bg-gray-100 z-10'>
                                    <TableRow>
                                        <TableHead className='text-center flex items-center space-x-1'><Checkbox onCheckedChange={toggleEnableAllModels} /><span>Enable</span></TableHead>
                                        <TableHead className='text-center'>DisplayName</TableHead>
                                        <TableHead className='text-center'>ModelValue</TableHead>
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
                                            <TableRow key={idx} className={cn(idx % 2 === 0 ? 'bg-blue-gray-100' : 'bg-blue-gray-50')}>
                                                <TableCell><Checkbox checked={m.enable} onCheckedChange={checked => onModelEnableStatusChange(checked, m)}/></TableCell>
                                                <TableCell className='text-left max-w-0' onClick={_ => onModelTableCellClick(m.name)}>
                                                    <TooltipProvider>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <p className='truncate'>{m.name}</p>
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                <p>{m.name}</p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                </TableCell>
                                                <TableCell className='text-left max-w-0' onClick={_ => onModelTableCellClick(m.value)}>
                                                <TooltipProvider>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <p className='truncate'>{m.value}</p>
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                <p>{m.value}</p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                </TableCell>
                                                <TableCell className='text-center'>{m.type}</TableCell>
                                                <TableCell className='text-center'>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="outline" size='xs' className='rounded-lg'><SquarePen className='w-3'></SquarePen></Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent className="w-auto" align="start">
                                                            <DropdownMenuItem>Edit</DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem>Delete</DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    }
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </TabsContent>
                <TabsContent value="providers" className='w-[640px] h-[600px] focus:ring-0 focus-visible:ring-0'>
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
                                        <TableHead className='text-center flex items-center space-x-1'><Checkbox onCheckedChange={toggleEnableAllModels} /><span>Enable</span></TableHead>
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
                </TabsContent>
                <TabsContent value="tool" className='w-[640px] min-h-96 space-y-1 focus:ring-0 focus-visible:ring-0'>
                    <div className='w-full space-y-1'>
                        <Label className="hover:bg-accent/50 flex items-start gap-3 rounded-lg border p-3 has-[[aria-checked=true]]:bg-blue-50">
                            <Checkbox
                            checked={titleGenerateEnabled}
                            onCheckedChange={_ => setTitleGenerateEnabled(!titleGenerateEnabled)}
                            id="toggle-title-generation"
                            defaultChecked
                            className="data-[state=checked]:text-white"
                            />
                            <div className="grid gap-1.5 font-normal">
                                <p className="text-sm leading-none font-medium">
                                    Title generation
                                </p>
                                <p className="text-muted-foreground text-sm">
                                    Enable or disable title generation.
                                </p>
                            </div>
                            <div className="app-undragable flex items-center space-x-1">
                                <Popover open={selectTitleModelPopoutState} onOpenChange={setSelectTitleModelPopoutState}>
                                    <PopoverTrigger disabled={!titleGenerateEnabled} asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={selectTitleModelPopoutState}
                                            className="flex justify-between pl-1 pr-1 space-x-2"
                                        >
                                            <span className="flex flex-grow overflow-x-hidden">
                                                {
                                                    titleGenerateModel ? titleGenerateModel.name : "Select model..."
                                                }
                                            </span>
                                            <ChevronsUpDown className="flex opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-full p-0">
                                        <Command>
                                            <CommandInput id="provider" placeholder="Search provider..." className="h-9" />
                                            <CommandList>
                                                <CommandEmpty>Oops...NotFound</CommandEmpty>
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
                                                            <Check className={cn("ml-auto", titleGenerateModel && titleGenerateModel.value === md.value && titleGenerateModel.provider === md.provider ? "opacity-100" : "opacity-0")} />
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </Label>
                    </div>
                    <div className='w-full space-y-1'>
                        <Label className="hover:bg-accent/50 flex items-start rounded-lg border p-2">
                            <div className="grid grid-cols-7 gap-1.5 font-normal w-full p-2">
                                <div className='col-span-3'>
                                    <p className="text-sm leading-none font-medium">
                                        WebSearch Items
                                    </p>
                                    <p className="text-muted-foreground text-sm">
                                        Larger items means more tokens cost.
                                    </p>
                                </div>
                                <div className='col-span-1'>
                                    <Input className='focus-visible:ring-transparent focus-visible:ring-offset-0' defaultValue={2} />
                                </div>
                            </div>
                        </Label>
                    </div>
                </TabsContent>
                <TabsContent value="mcp-server" className='w-[640px] min-h-96 max-h-[600px] overflow-scroll space-y-1 rounded-md focus:ring-0 focus-visible:ring-0'>
                    <CodeEditor
                        value={msConfig}
                        language="json"
                        placeholder="Please enter JSON code."
                        onChange={(e) => onMcpServerConfigChange(e)}
                        style={{
                            backgroundColor: "#f5f5f5",
                            fontFamily: 'ui-monospace,SFMono-Regular,SF Mono,Consolas,Liberation Mono,Menlo,monospace',
                        }}
                        />
                </TabsContent>
                <div className='space-y-1 mt-1'>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <p className='text-xs text-orange-300 col-span-4 select-none'>Remember to SAVE, after configurations change</p>
                    </div>
                    <Button size="xs" onClick={saveConfigurationClick}>
                        Save
                    </Button>
                </div>
            </Tabs>
        </div>
    )
}

export default PreferenceComponent

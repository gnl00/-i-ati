import React, { useEffect, useRef, useState } from 'react'
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
import { Button } from "@renderer/components/ui/button"
import { Badge } from '@renderer/components/ui/badge'
import { Label } from '@renderer/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { Command, CommandItem, CommandGroup, CommandEmpty, CommandList, CommandInput } from '@renderer/components/ui/command'
import { Check, ChevronsUpDown } from "lucide-react"
import { Drawer, DrawerHeader, DrawerContent, DrawerTitle, DrawerTrigger, DrawerFooter, DrawerClose } from '@renderer/components/ui/drawer'
import { Input } from '@renderer/components/ui/input'
import { toast } from '@renderer/components/ui/use-toast'
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
interface PreferenceProps {
    onTokenQuestionClick: (url: string) => void;
}

const PreferenceComponent: React.FC<PreferenceProps> = ({onTokenQuestionClick}) => {

    const { 
        appVersion,
        appConfig,
        setAppConfig, 
        models, 
        providers, 
        setProviders,
        getProviderByName,
        currentProviderName,
        setCurrentProviderName,
        updateProvider,
        addProvider, 
        removeProvider,
        addModel,
        toggleModelEnable,
        titleGenerateModel, setTitleGenerateModel,
        titleGenerateEnabled, setTitleGenerateEnabled
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

    const providerCardRef = useRef<HTMLDivElement>(null)
    const theEndProviderCardRef = useRef<HTMLDivElement>(null)
    
    async function fetchModels() {
        try {
            const response = await fetch('https://raw.githubusercontent.com/gnl00/-i-ati/refs/heads/main/data/models.json');
            // console.log('Response received:', response.status, response.statusText);
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            const data = await response.json();
            console.log('models fetched:', data);
            // fs.writeFileSync(path.join(__dirname, '../../data/models.json'), JSON.stringify(data, null, 2));
            // console.log('Models written to file successfully.');
        } catch (error: any) {
            console.info('Error fetching models:', error.message);
        }
    }

    useEffect(() => {
        // fetchModels()
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

    useEffect(() => {}, [editProviderName, editProviderApiUrl, editProviderApiKey])

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
        if (!currentProvider) return
        
        console.log('saveConfigurationClick', editProviderName, editProviderApiUrl, editProviderApiKey)
        
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
        
        const updatedAppConfig = {
            ...appConfig,
            providers: providers,
            // titleModel: titleGenerateModel // TODO save title generation model to config file
        }
        setAppConfig(updatedAppConfig)
        
        toast({
            className: 'buttom-1 right-1 flex',
            variant: 'default',
            // title: 'Save Configuration',
            description: '✅ Save configurations success',
            duration: 1000
            // action: <ToastAction altText="Try again">Try again</ToastAction>
        })
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
        // console.log('add new povider', newProvider)
        toast({
            variant: 'default',
            duration: 800,
            className: 'flex fixed bottom-1 right-1 sm:w-1/3 md:w-1/4 lg:w-1/5',
            description: `✅ ${newProviderName} added`,
        })
        // TODO save provider to local config
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
    const onModelTableCellClick = (val: string) => {
        navigator.clipboard.writeText(val)
        toast({
            variant: 'default',
            duration: 800,
            className: 'flex fixed bottom-1 right-1 sm:w-1/3 md:w-1/4 lg:w-1/5',
            description: `✅ Copied`,
        })
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
            const updatedProvider = {
                ...currentProvider,
                [key]: value
            }
            updateProvider(currentProvider.name, updatedProvider)
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
    return (
        <div className="grid gap-4">
            <div className="space-y-2 select-none">
                <h4 className="font-medium leading-none space-x-2">
                    <span>@i</span>
                    <Badge variant="secondary" className='bg-slate-100 text-gray-800'>{appVersion}</Badge>
                </h4>
                <p className="text-sm text-muted-foreground">Set the preferences for @i</p>
            </div>
            <Tabs defaultValue="providers">
                <TabsList>
                    <TabsTrigger value="providers">Providers</TabsTrigger>
                    <TabsTrigger value="misc">Misc</TabsTrigger>
                </TabsList>
                <TabsContent value="providers" className='w-[640px] h-[600px]'>
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
                                                            className="w-full h-10"
                                                            onChange={e => { setNewProviderName(e.target.value) }}
                                                        />
                                                    </div>
                                                    <div className="flex flex-col items-start gap-2">
                                                        <Label htmlFor="apiUrl">API URL</Label>
                                                        <Input
                                                            id="apiUrl"
                                                            placeholder="https://api.openai.com/v1/chat/completions"
                                                            className="w-full h-10"
                                                            onChange={e => { setNewProviderApi(e.target.value) }}
                                                        />
                                                    </div>
                                                    <div className="flex flex-col items-start gap-2">
                                                        <Label htmlFor="apiKey">API Key</Label>
                                                        <Input
                                                            id="apiKey"
                                                            placeholder="sk-********"
                                                            className="w-full h-10"
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
                                    <div key={fProvider.name}>
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
                                className='flex-grow' 
                                value={editProviderName}
                                placeholder="Custom provider name"
                                onChange={(e) => {
                                    setEditProviderName(e.target.value)
                                    updateCurrentProvider('name', e.target.value)
                                }}
                                />
                        </div>
                        <div className='flex-none h-14 pl-1 pr-1 space-x-2 flex justify-center items-center'>
                            <Label className='flex-none' htmlFor="provider">ApiUrl&emsp;</Label>
                            <Input id="provider" 
                                className='flex-grow'
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
                                className='flex-grow'
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
                                        <TableCell><Input className='h-8' value={nextAddModelLabel} onChange={e => setNextAddModelLabel(e.target.value)} /></TableCell>
                                        <TableCell><Input className='h-8' value={nextAddModelValue} onChange={e => setNextAddModelValue(e.target.value)} /></TableCell>
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
                <TabsContent value="misc" className='w-[640px] min-h-96'>
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

import React, { useEffect, useState } from 'react'
import { cn } from '@renderer/lib/utils'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs"
import {
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from "../ui/table"
import { Checkbox } from "../ui/checkbox"
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
    } from "../ui/select"
import { Carousel, CarouselItem, CarouselContent, CarouselNext, CarouselPrevious, type CarouselApi } from '../ui/carousel'
import { Card, CardContent } from '../ui/card'
import { Button } from "../ui/button"
import { Textarea } from "../ui/textarea"
import { Badge } from '../ui/badge'
import { Label } from '../ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { Command, CommandItem, CommandGroup, CommandEmpty, CommandList, CommandInput } from '../ui/command'
import { Check, ChevronsUpDown } from "lucide-react"
import { Drawer, DrawerHeader, DrawerContent, DrawerTitle, DrawerDescription, DrawerTrigger, DrawerFooter, DrawerClose } from '../ui/drawer'
import { Input } from '../ui/input'
import { Switch } from '../ui/switch'
import { toast } from '../ui/use-toast'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { TooltipProvider } from '../ui/tooltip'
import { QuestionMarkCircledIcon } from '@radix-ui/react-icons'
import { SAVE_CONFIG } from '@constants/index'
import { useChatStore } from '@renderer/store'
import openaiIcon from '@renderer/assets/provider-icons/openai.svg'
import openaiTextIcon from '@renderer/assets/provider-icons/openai-text.svg'
import anthropicIcon from '@renderer/assets/provider-icons/anthropic.svg'
import deepseekIcon from '@renderer/assets/provider-icons/deepseek.svg'
import moonshotIcon from '@renderer/assets/provider-icons/moonshot.svg'
import openrouterIcon from '@renderer/assets/provider-icons/openrouter.svg'
import siliconcloudIcon from '@renderer/assets/provider-icons/siliconcloud.svg'
import ollamaIcon from '@renderer/assets/provider-icons/ollama.svg'
import robotIcon from '@renderer/assets/provider-icons/robot-2-line.svg'
interface PreferenceProps {
    onTokenQuestionClick: (url: string) => void;
}

const PreferenceComponent: React.FC<PreferenceProps> = ({onTokenQuestionClick}) => {

    const { appVersion, appConfig, setAppConfig, provider, setProvider, models, setModels, providers, setProviders, titleProvider, selectedTitleModel, setSelectedTitleModel } = useChatStore()

    const [addProviderPopoutState, setAddProviderPopoutState] = useState(false)
    const [selectProviderPopoutState, setSelectProviderPopoutState] = useState(false)

    const [editProviderName, setEditProviderName] = useState<string>(provider.name)
    const [editProviderApiUrl, setEditProviderApiUrl] = useState<string>(provider.apiUrl)
    const [editProviderApiKey, setEditProviderApiKey] = useState<string>(provider.apiKey)

    const [nextAddModelEnable, setNextAddModelEnable] = useState<boolean>(false)
    const [nextAddModelLabel, setNextAddModelLabel] = useState<string>('')
    const [nextAddModelValue, setNextAddModelValue] = useState<string>('')
    const [nextAddModelType, setNextAddModelType] = useState<string>('')
    
    const [selectTitleModelPopoutState, setSelectTitleModelPopoutState] = useState(false)
    
    const [newProviderName, setNewProviderName] = useState<string>()
    const [newProviderApi, setNewProviderApi] = useState<string>()
    const [newProviderApiKey, setNewProviderApiKey] = useState<string>()
    const [newProviderModels, setNewProviderModels] = useState<IModel[]>([])
    
    const [titleGenerateEnabled, setTitleGenerateEnabled] = useState(true)

    const [carouselApi, setCarouselApi] = useState<CarouselApi>()

    async function fetchModels() {
        try {
            console.log('Fetching models from URL:', 'https://raw.githubusercontent.com/gnl00/-i-ati/refs/heads/main/data/models.json');
            const response = await fetch('https://raw.githubusercontent.com/gnl00/-i-ati/refs/heads/main/data/models.json');
            console.log('Response received:', response.status, response.statusText);
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            const data = await response.json();
            console.log('Data fetched:', data);
            // fs.writeFileSync(path.join(__dirname, '../../data/models.json'), JSON.stringify(data, null, 2));
            console.log('Models written to file successfully.');
        } catch (error: any) {
            console.info('Error fetching models:', error.message);
        }
    }

    useEffect(() => {
        fetchModels()

        setEditProviderName('')
        setEditProviderApiUrl('')
        setEditProviderApiKey('')
    }, [])

    useEffect(() => {
        setEditProviderName(provider.name)
        setEditProviderApiUrl(provider.apiUrl)
        setEditProviderApiKey(provider.apiKey)
    }, [provider])

    // useEffect(() => {
    //     carouselApi?.on('select', () => {
    //         const index = carouselApi.selectedScrollSnap()
    //         console.log(index);
            
    //         if (index < providers.length) {
    //             const nextProvider: IProvider = providers[index]
    //             setProvider(nextProvider)
    //             setEditProviderName(nextProvider.name)
    //             setEditProviderApiUrl(nextProvider.apiUrl)
    //             setEditProviderApiKey(nextProvider.apiKey)
    //         }
    //     })
    // }, [carouselApi])

    const updateProviders = () => {
        const nextProviders: IProvider[] = providers.map(p => {
            if (p.name === provider.name) {
                return provider
            }
            return p
        })
        setProviders(nextProviders)
    }

    const onConfigurationsChange = (p: IProvider): void => {
        setProvider({
            ...provider,
            ...p
        })
    }
    const onAddModelClick = () => {
        const nextAddModel: IModel = {enable: nextAddModelEnable, provider: provider.name, name: nextAddModelLabel, value: nextAddModelValue, type: nextAddModelType || 'llm'}
        console.log(nextAddModel)
        
        provider.models = [...provider.models, nextAddModel]
        
        setProvider(provider)
        updateProviders()

        const updatedModels = models.map(md => md.value === nextAddModel.value ? nextAddModel : md)
        setModels(updatedModels)

        setNextAddModelEnable(false)
        setNextAddModelLabel('')
        setNextAddModelValue('')
        setNextAddModelType('')
    }
    const onNextAddModelEnableChange = (val) => {
        setNextAddModelEnable(val)
    }
    const saveConfigurationClick = (): void => {
        console.log(editProviderName, editProviderApiUrl, editProviderApiKey, provider)
        const oldProviderName = provider.name

        const nextProvider = {
            ...provider,
            name: editProviderName,
            apiUrl: editProviderApiUrl,
            apiKey: editProviderApiKey
        }
        setProvider(nextProvider)

        if (editProviderName !== oldProviderName) {
            const updatedProviders = providers.map(p => {
                if (p.name === oldProviderName) {
                    return nextProvider
                }
                return p
            })
            setProviders(updatedProviders)
        } else {
            updateProviders()
        }
        
        const nextAppConfig = {
            ...appConfig,
            providers: providers,
        }
        setAppConfig(nextAppConfig)
        window.electron.ipcRenderer.invoke(SAVE_CONFIG, nextAppConfig)
        console.log('configurations to save: ', nextAppConfig)
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
            models: [...newProviderModels],
            apiUrl: newProviderApi,
            apiKey: newProviderApiKey
        }
        console.log(newProvider)
        setProvider(newProvider)
        setProviders([...providers, newProvider])
        setModels([...models, ...newProviderModels])
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
        // setSelectProviderPopoutState(false)
        const filterProviders = providers.filter(p => providerName !== p.name)
        if (provider.name === providerName) {
            setProvider(filterProviders[0])
        }
        setProviders(filterProviders)
    }
    const getIcon = (provider: string) => {
        let iconSrc = robotIcon
        switch (provider) {
            case "OpenAI":
                iconSrc = openaiIcon
                break
            case "Anthropic":
                iconSrc = anthropicIcon
                break
            case "DeepSeek":
                iconSrc = deepseekIcon
                break
            case "MoonShot":
                iconSrc = moonshotIcon
                break
            case "SilliconFlow":
                iconSrc = siliconcloudIcon
                break
            case "SiliconCloud":
                iconSrc = siliconcloudIcon
                break
            case "OpenRouter":
                iconSrc = openrouterIcon
                break
            default:
                break
        }
        return <img src={iconSrc} alt="OpenAI" className="w-14 h-14" />
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
        console.log('click', p)
        setProvider(p)
        setEditProviderName(p.name)
        setEditProviderApiUrl(p.apiUrl)
        setEditProviderApiKey(p.apiKey)
    }
    const onModelEnableStatusChange = (checked, model: IModel) => {
        model.enable = checked
        setProvider({
            ...provider,
            models: provider.models.map(m => m.value === model.value ? model : m)
        })
        updateProviders()
        if (!checked) {
            setModels(models.filter(m => m.value !== model.value))
        } else {
            setModels([...models, model])
        }
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
                    <TabsTrigger value="provider-card">ProviderCard</TabsTrigger>
                    <TabsTrigger value="misc">Misc</TabsTrigger>
                    <TabsTrigger value="providers">Providers</TabsTrigger>
                </TabsList>
                <TabsContent value="provider-card" className='w-[640px] h-[420px]'>
                    <Carousel className="p-2" setApi={setCarouselApi}>
                        <CarouselContent>
                            {
                                providers.map(fProvider => (
                                    <CarouselItem key={fProvider.name}>
                                        <div className=' flex flex-col'>
                                            <div className='flex-1 flex'>
                                                <div className='flex-none select-none bg-gray-100 rounded justify-center items-center mb-2 w-20 h-26'>
                                                    {getIcon(fProvider.name)}
                                                </div>
                                                <div className='flex-grow col-span-3 p-2 space-y-2'>
                                                    <div className='grid grid-cols-9 items-center gap-2'>
                                                    <Label htmlFor="provider" className='font-semibold'>Provider</Label>
                                                    <Input
                                                        id="provider"
                                                        className="col-span-8 text-sm"
                                                        value={editProviderName}
                                                        placeholder="ProviderName"
                                                        onChange={(e) => {
                                                            const nextNameVal = e.target.value
                                                            setEditProviderName(nextNameVal)
                                                            setProvider({
                                                                ...provider,
                                                                name: nextNameVal
                                                            })
                                                            updateProviders()
                                                        }}
                                                    />
                                                    </div>
                                                    <div className="grid grid-cols-9 items-center gap-2">
                                                        <Label htmlFor="api" className='font-semibold'>API</Label>
                                                        <Input
                                                            id="api"
                                                            className="col-span-8 text-sm"
                                                            value={editProviderApiUrl}
                                                            placeholder="https://provider-api.com/v1/chat/x"
                                                            onChange={(e) => {
                                                                const nextApiVal = e.target.value
                                                                setEditProviderApiUrl(nextApiVal)
                                                                setProvider({
                                                                    ...provider,
                                                                    apiUrl: nextApiVal
                                                                })
                                                                updateProviders()
                                                            }}
                                                        />
                                                    </div>
                                                    <div className="grid grid-cols-9 items-center gap-2">
                                                        <Label htmlFor="token" className='font-semibold'>Token</Label>
                                                        <Input
                                                            id="token"
                                                            className="col-span-8 text-sm"
                                                            placeholder="Please input your token"
                                                            value={editProviderApiKey}
                                                            onChange={(e) => {
                                                                const nextKeyVal = e.target.value
                                                                setEditProviderApiKey(nextKeyVal)
                                                                setProvider({
                                                                    ...provider,
                                                                    apiKey: nextKeyVal
                                                                })
                                                                updateProviders()
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className='flex-1'>
                                                {/* <Label htmlFor="models">Models</Label> */}
                                                <div className="items-center gap-1 overflow-scroll h-64 scroll-smooth">
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead className='text-center'>Enable</TableHead>
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
                                                                fProvider.models.map((m, idx) => (
                                                                    <TableRow key={idx}>
                                                                        <TableCell><Checkbox /></TableCell>
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
                                        </div>
                                    </CarouselItem>
                                ))
                            }
                            <CarouselItem onClick={e => { console.log('add new provider') }}>
                                <Card className="p-1">
                                    <CardContent className="aspect-square select-none text-gray-300 hover:bg-gray-50 w-full h-96">
                                        <Drawer>
                                            <DrawerTrigger className='w-full h-full'>
                                                <p className="text-5xl font-semibold"><i className="ri-add-circle-line"></i></p>
                                                <p>Add new provider</p>
                                            </DrawerTrigger>
                                            <DrawerContent>
                                                <DrawerHeader>
                                                    <DrawerTitle>Add new provider</DrawerTitle>
                                                </DrawerHeader>
                                                <DrawerFooter>
                                                    <div className="grid gap-4 app-undragable">
                                                        <div className="grid gap-2">
                                                            <div className="grid grid-cols-3 items-center gap-4">
                                                                <Label htmlFor="name">Name</Label>
                                                                <Input
                                                                    id="name"
                                                                    placeholder="OpenAI"
                                                                    className="col-span-2 h-10"
                                                                    onChange={e => { setNewProviderName(e.target.value) }}
                                                                />
                                                            </div>
                                                            <div className="grid grid-cols-3 items-center gap-4">
                                                                <Label htmlFor="apiUrl">API URL</Label>
                                                                <Input
                                                                    id="apiUrl"
                                                                    placeholder="https://api.openai.com/v1/chat/completions"
                                                                    className="col-span-2 h-10"
                                                                    onChange={e => { setNewProviderApi(e.target.value) }}
                                                                />
                                                            </div>
                                                            <div className="grid grid-cols-3 items-center gap-4">
                                                                <Label htmlFor="apiKey">API Key</Label>
                                                                <Input
                                                                    id="apiKey"
                                                                    placeholder="sk-********"
                                                                    className="col-span-2 h-10"
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
                                    </CardContent>
                                </Card>
                            </CarouselItem>
                        </CarouselContent>
                        <CarouselPrevious className='left-0 -translate-y-4' />
                        <CarouselNext className='right-0 -translate-y-4' />
                    </Carousel>
                </TabsContent>
                <TabsContent value="misc" className='w-[640px] min-h-96'>
                    <div className='w-full'>
                        <p className="text-xl font-medium text-gray-800 cursor-pointer text-muted-foreground">Title Generation</p>
                        <div className="grid gap-2">
                            <div className="grid grid-cols-4 items-center gap-1">
                                <Label htmlFor="provider">Enable</Label>
                                <div className='flex items-center space-x-1'>
                                    <Switch checked={titleGenerateEnabled} onCheckedChange={setTitleGenerateEnabled} />
                                </div>
                            </div>
                            <div className="grid grid-cols-4 items-center gap-1">
                                <Label htmlFor="provider">Model</Label>
                                <div className="app-undragable flex items-center space-x-1">
                                    <Popover open={selectTitleModelPopoutState} onOpenChange={setSelectTitleModelPopoutState}>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                role="combobox"
                                                aria-expanded={selectTitleModelPopoutState}
                                                className="flex justify-between pl-1 pr-1 space-x-2"
                                            >
                                                <span className="flex flex-grow overflow-x-hidden">
                                                    {
                                                        selectedTitleModel ? selectedTitleModel : "Select model..."
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
                                                        {models.map((md) => (
                                                            <CommandItem
                                                                key={md.name}
                                                                value={md.name}
                                                                onSelect={(currentValue) => {
                                                                    setSelectTitleModelPopoutState(false)
                                                                    setSelectedTitleModel(currentValue)
                                                                }}
                                                            >
                                                                {md.name}
                                                                <Check className={cn("ml-auto", titleProvider?.name === md.name ? "opacity-100" : "opacity-0")} />
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
                </TabsContent>
                <TabsContent value="providers" className='w-[640px] h-[600px]'>
                    <Carousel className="m-2 p-0.5 h-20" setApi={setCarouselApi}>
                        <CarouselContent>
                            {
                                providers.map(fProvider => (
                                    <CarouselItem key={fProvider.name} className='basis-1/5'>
                                        <div className='flex flex-col justify-center items-center bg-gray-100 rounded' onClick={_ => onProviderCardClick(fProvider)}>
                                            {getIcon(fProvider.name)}
                                            <p className='select-none'>{fProvider.name}</p>
                                        </div>
                                    </CarouselItem>
                                ))
                            }
                            <div className='ml-4 bg-gray-100 rounded-md'>
                                <Drawer>
                                    <DrawerTrigger className='flex flex-col h-full justify-center items-start text-gray-400 w-24'>
                                        <p className="text-5xl font-semibold w-full"><i className="ri-add-circle-line"></i></p>
                                    </DrawerTrigger>
                                    <DrawerContent>
                                        <DrawerHeader>
                                            <DrawerTitle>Add new provider</DrawerTitle>
                                        </DrawerHeader>
                                        <DrawerFooter>
                                            <div className="grid gap-4 app-undragable">
                                                <div className="grid gap-2">
                                                    <div className="grid grid-cols-3 items-center gap-4">
                                                        <Label htmlFor="name">Name</Label>
                                                        <Input
                                                            id="name"
                                                            placeholder="OpenAI"
                                                            className="col-span-2 h-10"
                                                            onChange={e => { setNewProviderName(e.target.value) }}
                                                        />
                                                    </div>
                                                    <div className="grid grid-cols-3 items-center gap-4">
                                                        <Label htmlFor="apiUrl">API URL</Label>
                                                        <Input
                                                            id="apiUrl"
                                                            placeholder="https://api.openai.com/v1/chat/completions"
                                                            className="col-span-2 h-10"
                                                            onChange={e => { setNewProviderApi(e.target.value) }}
                                                        />
                                                    </div>
                                                    <div className="grid grid-cols-3 items-center gap-4">
                                                        <Label htmlFor="apiKey">API Key</Label>
                                                        <Input
                                                            id="apiKey"
                                                            placeholder="sk-********"
                                                            className="col-span-2 h-10"
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
                        </CarouselContent>
                        <CarouselPrevious className='left-0 -translate-y-4' />
                        <CarouselNext className='right-0 -translate-y-4' />
                    </Carousel>
                    <div className='h-[84%] flex flex-col mt-2 pl-2 pr-2'>
                        <div className='flex-none h-14 pl-1 pr-1 space-x-2 flex justify-center items-center'>
                            <Label className='flex-none' htmlFor="provider">Provider</Label>
                            <Input id="provider" 
                                className='flex-grow' 
                                value={editProviderName}
                                onChange={(e) => {
                                    const nextNameVal = e.target.value
                                    setEditProviderName(nextNameVal)
                                    setProvider({
                                        ...provider,
                                        name: nextNameVal
                                    })
                                    updateProviders()
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
                                    const nextApiVal = e.target.value
                                    setEditProviderApiUrl(nextApiVal)
                                    setProvider({
                                        ...provider,
                                        apiUrl: nextApiVal
                                    })
                                    updateProviders()
                                }}
                                />
                        </div>
                        <div className='flex-none h-14 pl-1 pr-1 space-x-2 flex justify-center items-center'>
                            <Label className='flex-none' htmlFor="provider">ApiKey&ensp;</Label>
                            <Input id="provider" 
                                className='flex-grow'
                                placeholder="Please input your api-key"
                                value={editProviderApiKey}
                                onChange={(e) => {
                                    const nextKeyVal = e.target.value
                                    setEditProviderApiKey(nextKeyVal)
                                    setProvider({
                                        ...provider,
                                        apiKey: nextKeyVal
                                    })
                                    updateProviders()
                                }}
                                />
                        </div>
                        <div className='flex-grow h-full overflow-scroll'>
                            <Table>
                                <TableHeader className=''>
                                    <TableRow>
                                        <TableHead className='text-center'>Enable</TableHead>
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
                                        provider.models.map((m, idx) => (
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
                <div className='space-y-1 mt-1'>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <p className='text-xs text-slate-500 col-span-4 select-none'>Remember to SAVE, after configurations change</p>
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

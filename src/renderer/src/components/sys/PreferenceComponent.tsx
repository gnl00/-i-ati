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
import { Carousel, CarouselItem, CarouselContent, CarouselNext, CarouselPrevious } from '../ui/carousel'
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
import { OpenAI, Anthropic, DeepSeek, OpenRouter, Kimi, SiliconCloud } from '@lobehub/icons';
interface PreferenceProps {
    onTokenQuestionClick: (url: string) => void;
}

const PreferenceComponent: React.FC<PreferenceProps> = ({onTokenQuestionClick}) => {
    const [addProviderPopoutState, setAddProviderPopoutState] = useState(false)
    const [selectProviderPopoutState, setSelectProviderPopoutState] = useState(false)
    const [nextAddModelEnable, setNextAddModelEnable] = useState<boolean>(false)
    const [nextAddModelLabel, setNextAddModelLabel] = useState<string>('')
    const [nextAddModelValue, setNextAddModelValue] = useState<string>('')
    const [nextAddModelType, setNextAddModelType] = useState<string>('')
    const [selectTitleModelPopoutState, setSelectTitleModelPopoutState] = useState(false)
    const [newProviderName, setNewProviderName] = useState<string>()
    const [newProviderApi, setNewProviderApi] = useState<string>()
    const [newProviderApiKey, setNewProviderApiKey] = useState<string>()
    const [newProviderModels, setNewProviderModels] = useState<IModel[]>([])
    const { appVersion, appConfig, setAppConfig, provider, setProvider, models, setModels, providers, setProviders, titleProvider, setTitleProvider, selectedTitleModel, setSelectedTitleModel } = useChatStore()
    const [titleGenerateEnabled, setTitleGenerateEnabled] = useState(true)

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
    }, [])

    const onConfigurationsChange = (p: IProvider): void => {
        setProvider({
            ...provider,
            ...p
        })
    }
    const onAddModelClick = () => {
        const nextAddModel: IModel = {enable: nextAddModelEnable, provider, name: nextAddModelLabel, value: nextAddModelValue, type: nextAddModelType || 'llm'}

        setProvider({
            ...provider,
            models: [...provider.models, nextAddModel]
        })

        setNextAddModelEnable(false)
        setNextAddModelLabel('')
        setNextAddModelValue('')
        setNextAddModelType('')
    }
    const onNextAddModelEnableChange = (val) => {
        setNextAddModelEnable(val)
    }
    const saveConfigurationClick = (): void => {
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

    const onNewProviderModelsChange = e => {
        if (e.target.value) {
            const modelNames = e.target.value.split(',')
            const models: IModel[] = modelNames.map(name => {
                const model: IModel = {
                    provider: newProviderName!,
                    name: name,
                    value: name,
                    type: 'llm'
                }
                return model
            })
            setNewProviderModels(models)
        }
    }
    const onAddProviderBtnClick = e => {
        if (!newProviderName || !newProviderApi || !newProviderApiKey || newProviderModels.length === 0) {
            alert(`Please fill all blanks`)
            e.preventDefault()
            return
        }
        if (providers.find(item => item.name == newProviderName) != undefined) {
            alert(`Provider:${newProviderName} already exists!`)
            e.preventDefault()
            return
        }
        setProviders([...providers, {
            name: newProviderName,
            models: [...newProviderModels],
            apiUrl: newProviderApi,
            apiKey: newProviderApiKey
        }])
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
    const onCarouselItemChange = (e) => {
        console.log(e);
    }
    const getIcon = (provider: string) => {
        switch (provider) {
            case "OpenAI":
                return <OpenAI className='w-20 h-20' />
            case "Anthropic":
                return <Anthropic className='w-20 h-20' />
            case "DeepSeek":
                return <DeepSeek className='w-20 h-20' />
            case "MoonShot":
                return <Kimi className='w-20 h-20' />
            case "SilliconFlow":
                return <SiliconCloud className='w-20 h-20' />
            case "SiliconCloud":
                return <SiliconCloud className='w-20 h-20' />
            case "OpenRouter":
                return <OpenRouter className='w-20 h-20' />
            default:
                return <></>
        }
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
    return (
        <div className="grid gap-4">
            <div className="space-y-2 select-none">
                <h4 className="font-medium leading-none space-x-2">
                    <span>@i</span>
                    <Badge variant="secondary" className='bg-slate-100 text-gray-800'>{appVersion}</Badge>
                </h4>
                <p className="text-sm text-muted-foreground">Set the preferences for @i</p>
            </div>
            <Tabs defaultValue="misc">
                <TabsList>
                    <TabsTrigger value="provider-card">ProviderCard</TabsTrigger>
                    <TabsTrigger value="misc">Misc</TabsTrigger>
                </TabsList>
                <TabsContent value="provider-card" className='w-[640px] h-[420px]'>
                    <Carousel className="p-2" onChange={onCarouselItemChange}>
                        <CarouselContent>
                            {
                                providers.map(provider => (
                                    <CarouselItem key={provider.name}>
                                    <div className=' flex flex-col'>
                                        <div className='flex-1 flex'>
                                            <div className='flex-none select-none bg-gray-100 rounded justify-center items-center mb-2 w-20 h-full'>
                                                {getIcon(provider.name)}
                                            </div>
                                            <div className='flex-grow col-span-3 p-2 space-y-2'>
                                                <div className='grid grid-cols-9 items-center gap-2'>
                                                <Label htmlFor="provider" className='font-semibold'>Provider</Label>
                                                <Input
                                                    id="provider"
                                                    className="col-span-8 text-sm"
                                                    value={provider?.name || ''}
                                                    placeholder="ProviderName"
                                                    onChange={(event) =>
                                                        setProvider({
                                                            ...provider,
                                                            name: event.target.value
                                                        })
                                                    }
                                                />
                                                </div>
                                                <div className="grid grid-cols-9 items-center gap-2">
                                                    <Label htmlFor="api" className='font-semibold'>API</Label>
                                                    <Input
                                                        id="api"
                                                        className="col-span-8 text-sm"
                                                        value={provider?.apiUrl || ''}
                                                        placeholder="https://provider-api.com/v1/chat/x"
                                                        onChange={(event) =>
                                                            setProvider({
                                                                ...provider,
                                                                apiUrl: event.target.value
                                                            })
                                                        }
                                                    />
                                                </div>
                                                <div className="grid grid-cols-9 items-center gap-2">
                                                    <Label htmlFor="token" className='font-semibold'>Token</Label>
                                                    <Input
                                                        id="token"
                                                        placeholder="Please input your token"
                                                        value={provider?.apiKey || ''}
                                                        className="col-span-8 text-sm"
                                                        onChange={(event) =>
                                                            setProvider({
                                                                ...provider,
                                                                apiKey: event.target.value
                                                            })
                                                        }
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        <div className='flex-1'>
                                            {/* <Label htmlFor="models">Models</Label> */}
                                            <div className="items-center gap-1 overflow-scroll h-64">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>Enable</TableHead>
                                                            <TableHead>Label</TableHead>
                                                            <TableHead>Value</TableHead>
                                                            <TableHead>Type</TableHead>
                                                            <TableHead>Operation</TableHead>
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
                                                            provider.models.map(m => (
                                                                <TableRow key={m.value}>
                                                                    <TableCell><Checkbox checked={true} /></TableCell>
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
                            <CarouselItem onClick={e => { console.log('add new assistant') }}>
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
                                                            <div className="grid grid-cols-3 items-center gap-4">
                                                                <Label htmlFor="models">Models</Label>
                                                                <Textarea
                                                                    id="models"
                                                                    placeholder="model1,model2,model3"
                                                                    className="col-span-2 h-8"
                                                                    onChange={onNewProviderModelsChange}
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
                <div className='space-y-1'>
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

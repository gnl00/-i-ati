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

interface PreferenceProps {
    onTokenQuestionClick: (url: string) => void;
}

const PreferenceComponent: React.FC<PreferenceProps> = ({
    onTokenQuestionClick,
}) => {
    const [addProviderPopoutState, setAddProviderPopoutState] = useState(false)
    const [selectProviderPopoutState, setSelectProviderPopoutState] = useState(false)
    const [modelInput, setModelInput] = useState<string>()
    const [nextAddModelType, setNextAddModelType] = useState<string>()
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
    const onModelChange = (e) => {
        const currentModelInput = e.target.value
        if (!currentModelInput) return

        const models = currentModelInput?.split('\n')
        if (!models) return
        const ms = models?.map(mName => ({provider, name: mName, value: mName, type: 'llm'}));
        if (ms) {
            provider.models = ms
            setProvider(provider)
        }
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
    return (
        <div className="grid gap-4">
            <div className="space-y-2 select-none">
                <h4 className="font-medium leading-none space-x-2">
                    <span>@i</span>
                    <Badge variant="secondary" className='bg-slate-100 text-gray-800'>{appVersion}</Badge>
                </h4>
                <p className="text-sm text-muted-foreground">Set the preferences for @i</p>
            </div>
            <Tabs defaultValue="provider" className="w-auto">
                <TabsList>
                    <TabsTrigger value="provider">Provider</TabsTrigger>
                    <TabsTrigger value="misc">Misc</TabsTrigger>
                </TabsList>
                <TabsContent value="provider">
                    <div className="grid gap-2">
                        <div className="grid grid-cols-4 items-center gap-1">
                            <Label htmlFor="provider">Provider</Label>
                            <div className="app-undragable flex items-center space-x-1">
                                <Popover open={selectProviderPopoutState} onOpenChange={setSelectProviderPopoutState}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={selectProviderPopoutState}
                                            className="flex justify-between pl-1 pr-1 space-x-2"
                                            >
                                            <span className="flex flex-grow overflow-x-hidden">
                                                {provider ? provider.name : "Select provider..."}
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
                                                    {providers.map((pr) => (
                                                        <CommandItem
                                                            key={pr.name}
                                                            value={pr.name}
                                                            onSelect={(currentValue) => {
                                                                setSelectProviderPopoutState(false)
                                                                setProvider(providers.find(p => p.name === currentValue)!)
                                                                setModelInput('')
                                                            }}
                                                        >
                                                            {pr.name}
                                                            <Check className={cn("ml-auto", provider?.name === pr.name ? "opacity-100" : "opacity-0")} />
                                                            <i onClick={e => { onDelProviderBtnClick(e, pr.name) }} className="ri-indeterminate-circle-line w-3 h-3 rounded-full p-3 text-red-300 hover:bg-red-400 hover:text-white flex justify-center items-center" />
                                                        </CommandItem>
                                                    ))}
                                                    <CommandItem>
                                                        <Button className="w-full space-x-1" size="sm" variant={"ghost"} onClick={_ => { setSelectProviderPopoutState(false); setAddProviderPopoutState(true) }}>Add&nbsp;<i className="ri-add-circle-line text-lg"></i></Button>
                                                    </CommandItem>
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                                <Drawer open={addProviderPopoutState} onOpenChange={setAddProviderPopoutState}>
                                    <DrawerTrigger asChild>
                                    </DrawerTrigger>
                                    <DrawerContent>
                                        <DrawerHeader>
                                            <DrawerTitle>Add provider</DrawerTitle>
                                            <DrawerDescription>Add custom provider</DrawerDescription>
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
                                <Button className="w-full space-x-1" size="sm" variant={"ghost"} onClick={_ => { setSelectProviderPopoutState(false); setAddProviderPopoutState(true) }}>Add&nbsp;<i className="ri-add-circle-line text-lg"></i></Button>
                            </div>
                        </div>
                        <div className="grid grid-cols-9 items-center gap-4">
                            <Label htmlFor="api">API</Label>
                            <Input
                                id="api"
                                className="col-span-8 h-8 text-sm"
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
                        <div className="grid grid-cols-9">
                            <Label htmlFor="token">Token</Label>
                            <Input
                                id="token"
                                placeholder="Please input your token"
                                value={provider?.apiKey || ''}
                                className="col-span-8 h-8 text-sm"
                                onChange={(event) =>
                                    setProvider({
                                        ...provider,
                                        apiKey: event.target.value
                                    })
                                }
                            />
                        </div>
                        <Label htmlFor="models">Models</Label>
                        <div className="grid-cols-1 items-center gap-1 overflow-scroll max-h-96 relative">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Enable</TableHead>
                                        <TableHead>Label</TableHead>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Operation</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    <TableRow>
                                            <TableCell><Checkbox/></TableCell>
                                            <TableCell><Input className='h-8' /></TableCell>
                                            <TableCell><Input className='h-8' /></TableCell>
                                            <TableCell>
                                                <Select value={nextAddModelType}>
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
                                            <TableCell className='text-center'><Button size={'xs'} variant={'outline'}><i className="ri-add-circle-line text-lg"></i></Button></TableCell>
                                        </TableRow>
                                    {
                                        provider.models.map(m => (
                                            <TableRow>
                                                <TableCell><Checkbox checked={true} /></TableCell>
                                                <TableCell className='text-left'>{m.name}</TableCell>
                                                <TableCell className='text-left'>{m.value}</TableCell>
                                                <TableCell className="text-left">
                                                    <Select value={m.type}>
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
                                            </TableRow>
                                        ))
                                    }
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </TabsContent>
                <TabsContent value="misc">
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
                </TabsContent>
            </Tabs>
            <div className="grid grid-cols-4 items-center gap-4">
                <p className='text-xs text-slate-500 col-span-4 select-none'>Remember to SAVE, after configurations change</p>
            </div>
            <Button size="xs" onClick={saveConfigurationClick}>
                Save Configuration
            </Button>
        </div>
    )
}

export default PreferenceComponent

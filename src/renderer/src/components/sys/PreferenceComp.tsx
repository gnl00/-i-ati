import React, { useState } from 'react'
import { cn } from '@renderer/lib/utils'
import { Button } from "../ui/button"
import { Textarea } from "../ui/textarea"
import { Badge } from '../ui/badge'
import { Label } from '../ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { Command, CommandItem, CommandGroup, CommandEmpty, CommandList, CommandInput } from '../ui/command'
import { Check, ChevronsUpDown } from "lucide-react"
import { Drawer, DrawerHeader, DrawerContent, DrawerTitle, DrawerDescription, DrawerTrigger, DrawerFooter, DrawerClose } from '../ui/drawer'
import { Input } from '../ui/input'
import { toast } from '../ui/use-toast'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { TooltipProvider } from '../ui/tooltip'
import { QuestionMarkCircledIcon } from '@radix-ui/react-icons'
import { useChatContext } from '@renderer/context/ChatContext'
import { SAVE_CONFIG } from '@constants/index'

interface PreferenceComponentProps {
    onTokenQuestionClick: (url: string) => void;
}

const PreferenceComponent: React.FC<PreferenceComponentProps> = ({
    onTokenQuestionClick,
}) => {
    const [selectProviderPopoutState, setSelectProviderPopoutState] = useState(false)
    const [newProviderName, setNewProviderName] = useState<string>()
    const [newProviderApi, setNewProviderApi] = useState<string>()
    const [newProviderApiKey, setNewProviderApiKey] = useState<string>()
    const [newProviderModels, setNewProviderModels] = useState<IModel[]>([])
    const { appVersion, appConfig, setAppConfig, provider, setProvider, providers, setProviders } = useChatContext()
    const onConfigurationsChange = (config: IAppConfig): void => {
        setAppConfig({
            ...appConfig,
            ...config
        })
    }
    const saveConfigurationClick = (): void => {
        window.electron.ipcRenderer.invoke(SAVE_CONFIG, appConfig)
        console.log('configurations to save: ', appConfig)
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
            const models = e.target.value.split(',')
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
        toast({
          variant: 'default',
          duration: 800,
          className: 'flex fixed bottom-1 right-1 sm:w-1/3 md:w-1/4 lg:w-1/5',
          description: `✅ ${newProviderName} added`,
        })
        // TODO save provider to local config
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
            <div className="grid gap-2">
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="provider">Provider</Label>
                    <div className="app-undragable flex items-center space-x-4">
                        <Popover open={selectProviderPopoutState} onOpenChange={setSelectProviderPopoutState}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={selectProviderPopoutState}
                                    className="flex justify-between pl-1 pr-1 space-x-2"
                                >
                                    <span className="flex flex-grow overflow-x-hidden">
                                        {
                                            provider ?
                                                (() => {
                                                    const selected = providers.find(p => p.name === provider.name);
                                                    if (!selected) return null;
                                                    return selected.name;
                                                })()
                                                : "Select provider..."
                                        }
                                    </span>
                                    <ChevronsUpDown className="flex opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-full p-0">
                                <Command>
                                    <CommandInput id="provider" placeholder="Search provider..." className="h-9" />
                                    <CommandList>
                                        <CommandEmpty>Oops... Not Found</CommandEmpty>
                                        <CommandGroup>
                                            {providers.map((pr) => (
                                                <CommandItem
                                                    key={pr.name}
                                                    value={pr.name}
                                                    onSelect={(currentValue) => {
                                                        setSelectProviderPopoutState(false);
                                                        setProvider(providers.findLast(p => p.name === currentValue));
                                                    }}
                                                >
                                                    {pr.name}
                                                    <Check className={cn("ml-auto", provider?.name === pr.name ? "opacity-100" : "opacity-0")} />
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                        <Drawer>
                            <DrawerTrigger asChild>
                                <Button className="w-full space-x-1" size="sm" variant={"secondary"} onClick={_ => { setSelectProviderPopoutState(false) }}>Add<i className="ri-add-circle-line text-lg"></i></Button>
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
                                                    onChange={e => {setNewProviderName(e.target.value)}}
                                                />
                                            </div>
                                            <div className="grid grid-cols-3 items-center gap-4">
                                                <Label htmlFor="apiUrl">API URL</Label>
                                                <Input
                                                    id="apiUrl"
                                                    placeholder="https://api.openai.com/v1/chat/completions"
                                                    className="col-span-2 h-10"
                                                    onChange={e => {setNewProviderApi(e.target.value)}}
                                                />
                                            </div>
                                            <div className="grid grid-cols-3 items-center gap-4">
                                                <Label htmlFor="apiKey">API Key</Label>
                                                <Input
                                                    id="apiKey"
                                                    placeholder="sk-********"
                                                    className="col-span-2 h-10"
                                                    onChange={e => {setNewProviderApiKey(e.target.value)}}
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
                    </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="api">API</Label>
                    <Input
                        id="api"
                        className="col-span-3 h-8 text-sm"
                        value={provider?.apiUrl || ''}
                        placeholder="server:port/chat/v1/x"
                        onChange={(event) =>
                            onConfigurationsChange({ ...appConfig, api: event.target.value })
                        }
                    />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="token">
                        <span>
                            Token
                            <Button size={'round'} variant={'ghost'}>
                                <TooltipProvider delayDuration={100}>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <QuestionMarkCircledIcon></QuestionMarkCircledIcon>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Get <strong className='underline' onClick={(_) => onTokenQuestionClick('https://cloud.siliconflow.cn/account/ak')}>SiliconFlow-Token</strong></p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </Button>
                        </span>
                    </Label>
                    <Input
                        id="token"
                        placeholder="Please input your token"
                        value={provider?.apiKey || ''}
                        className="col-span-3 h-8 text-sm"
                        onChange={(event) =>
                            onConfigurationsChange({ ...appConfig, token: event.target.value })
                        }
                    />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="model">
                        <span>
                            Model
                            <Button size={'round'} variant={'ghost'}>
                                <TooltipProvider delayDuration={100}>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <QuestionMarkCircledIcon></QuestionMarkCircledIcon>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Split by '\n'</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </Button>
                        </span>
                    </Label>
                    <Textarea
                        id="model"
                        className="col-span-3 h-8 text-sm"
                        value={provider?.models.map(m => m.value).join('\n') || ''}
                        onChange={(event) =>
                            onConfigurationsChange({ ...appConfig, model: event.target.value })
                        }
                    />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <p className='text-xs text-slate-500 col-span-4 select-none'>After configurations change, remember to save.</p>
                </div>
            </div>
            <Button size="xs" onClick={saveConfigurationClick}>
                Save Configuration
            </Button>
        </div>
    )
}

export default PreferenceComponent
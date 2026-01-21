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
import React, { useEffect, useMemo, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Cross1Icon } from '@radix-ui/react-icons'

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
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@renderer/components/ui/accordion"
import { useAppConfigStore } from '@renderer/store/appConfig'
import { Trash } from "lucide-react"
import { toast } from 'sonner'
import { getProviderIcon } from '@renderer/utils/providerIcons'
import FetchModelsDrawer from './FetchModelsDrawer'
import { v4 as uuidv4 } from 'uuid'
import { Badge } from "../ui/badge"

interface ProvidersManagerNextProps { }

const normalizeProviderId = (name: string): string => {
    return name.trim().toLowerCase().replace(/\s+/g, '-')
}

const ProvidersManagerNext: React.FC<ProvidersManagerNextProps> = () => {
    const {
        providerDefinitions,
        setProviderDefinitions,
        setAccounts,
        accounts,
        currentAccountId,
        setCurrentAccountId,
        addAccount,
        updateAccount,
        removeAccount,
        addModel,
        removeModel,
        toggleModelEnabled,
    } = useAppConfigStore()

    const visibleProviderDefinitions = useMemo(() => providerDefinitions, [providerDefinitions])

    const [selectedProviderId, setSelectedProviderId] = useState<string | undefined>(undefined)
    const [currentAccount, setCurrentAccount] = useState<ProviderAccount | undefined>(undefined)
    const [editAccountLabel, setEditAccountLabel] = useState<string>(currentAccount?.label || '')
    const [editAccountApiUrl, setEditAccountApiUrl] = useState<string>(currentAccount?.apiUrl || '')
    const [editAccountApiKey, setEditAccountApiKey] = useState<string>(currentAccount?.apiKey || '')

    const [nextAddModelLabel, setNextAddModelLabel] = useState<string>('')
    const [nextAddModelValue, setNextAddModelValue] = useState<string>('')
    const [nextAddModelType, setNextAddModelType] = useState<string>('')

    const [newDefinitionDisplayName, setNewDefinitionDisplayName] = useState<string>('')
    const [newDefinitionAdapterType, setNewDefinitionAdapterType] = useState<string>('openai')
    const [newProviderApi, setNewProviderApi] = useState<string>('')
    const [newProviderApiKey, setNewProviderApiKey] = useState<string>('')

    const [showFetchModelsDrawer, setShowFetchModelsDrawer] = useState<boolean>(false)
    const [hoverProviderCardIdx, setHoverProviderCardIdx] = useState<number>(-1)
    const [showApiKey, setShowApiKey] = useState<boolean>(false)
    const [showNewApiKey, setShowNewApiKey] = useState<boolean>(false)

    useEffect(() => {
        if (!selectedProviderId && visibleProviderDefinitions.length > 0) {
            setSelectedProviderId(visibleProviderDefinitions[0].id)
        }
    }, [visibleProviderDefinitions, selectedProviderId])

    useEffect(() => {
        if (!selectedProviderId) {
            if (currentAccountId) {
                setCurrentAccountId(undefined)
            }
            return
        }

        const currentAccountForProvider = accounts.find(item => item.id === currentAccountId)
        if (currentAccountForProvider?.providerId === selectedProviderId) {
            return
        }

        const fallbackAccount = accounts.find(item => item.providerId === selectedProviderId)
        setCurrentAccountId(fallbackAccount?.id)
    }, [accounts, currentAccountId, selectedProviderId, setCurrentAccountId])

    useEffect(() => {
        const account = accounts.find(item => item.id === currentAccountId)
        if (account) {
            setCurrentAccount(account)
            setEditAccountLabel(account.label)
            setEditAccountApiUrl(account.apiUrl)
            setEditAccountApiKey(account.apiKey)
        } else {
            setCurrentAccount(undefined)
            setEditAccountLabel('')
            setEditAccountApiUrl('')
            setEditAccountApiKey('')
        }
    }, [currentAccountId, accounts])

    const ensureAccountForProvider = (providerId: string): ProviderAccount => {
        const existing = accounts.find(account => account.providerId === providerId)
        if (existing) {
            return existing
        }

        const definition = visibleProviderDefinitions.find(def => def.id === providerId)
        const label = definition?.displayName ? `${definition.displayName} Account` : 'Account'

        const newAccount: ProviderAccount = {
            id: uuidv4(),
            providerId,
            label,
            apiUrl: definition?.defaultApiUrl || '',
            apiKey: '',
            models: []
        }

        addAccount(newAccount)
        setCurrentAccountId(newAccount.id)
        return newAccount
    }

    const onAddModelClick = () => {
        if (!selectedProviderId) return
        if (!nextAddModelValue.trim()) {
            toast.error('Model ID is required')
            return
        }

        const account = currentAccount ?? ensureAccountForProvider(selectedProviderId)
        const newModel: AccountModel = {
            id: nextAddModelValue.trim(),
            label: nextAddModelLabel.trim() || nextAddModelValue.trim(),
            type: (nextAddModelType || 'llm') as ModelType,
            enabled: true
        }

        addModel(account.id, newModel)

        setNextAddModelLabel('')
        setNextAddModelValue('')
        setNextAddModelType('')
    }

    const onAddProviderBtnClick = (e: React.MouseEvent) => {
        const displayName = newDefinitionDisplayName.trim()
        const baseUrl = newProviderApi.trim()
        const apiKey = newProviderApiKey.trim()
        if (!displayName || !baseUrl || !apiKey) {
            alert('Please input display name / API Base URL / API Key')
            e.preventDefault()
            return
        }

        let providerId = normalizeProviderId(displayName)
        if (!providerId) {
            providerId = `custom-${uuidv4()}`
        }

        if (providerDefinitions.some(def => normalizeProviderId(def.id) === providerId)) {
            const shortSuffix = uuidv4().slice(0, 8)
            providerId = `${providerId}-${shortSuffix}`
        }

        const adapterType = newDefinitionAdapterType.trim() || 'openai'

        const newDefinition: ProviderDefinition = {
            id: providerId,
            displayName,
            adapterType,
            apiVersion: 'v1',
            iconKey: providerId,
            defaultApiUrl: baseUrl
        }

        setProviderDefinitions([...providerDefinitions, newDefinition])
        const newAccount: ProviderAccount = {
            id: uuidv4(),
            providerId,
            label: `${displayName} Account`,
            apiUrl: baseUrl,
            apiKey,
            models: []
        }

        addAccount(newAccount)
        setCurrentAccountId(newAccount.id)
        setSelectedProviderId(providerId)

        setNewDefinitionDisplayName('')
        setNewDefinitionAdapterType('openai')
        setNewProviderApi('')
        setNewProviderApiKey('')
        setShowNewApiKey(false)

        toast.success(`Added ${displayName}`)
    }

    const onModelTableCellClick = (val: string) => {
        navigator.clipboard.writeText(val)
        toast.success('Copied')
    }

    const onProviderCardClick = (definition: ProviderDefinition) => {
        setSelectedProviderId(definition.id)
    }

    const onProviderDeleteClick = (event: React.MouseEvent, definition: ProviderDefinition) => {
        event.stopPropagation()
        const removedAccounts = accounts.filter(account => account.providerId === definition.id)
        const remainingDefinitions = providerDefinitions.filter(def => def.id !== definition.id)
        const remainingAccounts = accounts.filter(account => account.providerId !== definition.id)

        setProviderDefinitions(remainingDefinitions)
        setAccounts(remainingAccounts)

        if (selectedProviderId === definition.id) {
            setSelectedProviderId(remainingDefinitions[0]?.id)
            setCurrentAccountId(undefined)
        }

        toast.warning(`Provider "${definition.displayName}" deleted`, {
            action: {
                label: 'Undo',
                onClick: () => {
                    const { providerDefinitions: currentDefinitions, accounts: currentAccounts } = useAppConfigStore.getState()
                    const nextDefinitions = currentDefinitions.some(def => def.id === definition.id)
                        ? currentDefinitions
                        : [...currentDefinitions, definition]
                    const nextAccounts = [...currentAccounts, ...removedAccounts]

                    setProviderDefinitions(nextDefinitions)
                    setAccounts(nextAccounts)

                    if (removedAccounts[0]) {
                        setCurrentAccountId(removedAccounts[0].id)
                        setSelectedProviderId(definition.id)
                    }
                }
            }
        })
    }
    const onModelEnableStatusChange = (_checked: boolean, model: AccountModel) => {
        if (!currentAccount) return
        toggleModelEnabled(currentAccount.id, model.id)
    }

    const updateCurrentAccount = (updates: Partial<ProviderAccount>) => {
        if (!selectedProviderId) return
        const account = currentAccount ?? ensureAccountForProvider(selectedProviderId)
        const nextAccount = { ...account, ...updates }
        setCurrentAccount(nextAccount)
        updateAccount(account.id, updates)
    }

    const onProviderCardHover = (idx: number) => {
        setHoverProviderCardIdx(idx)
    }

    const onAccountDeleteClick = (_e: any, account?: ProviderAccount) => {
        if (!account) return
        if (currentAccount && currentAccount.id === account.id) {
            setCurrentAccount(undefined)
        }
        if (currentAccountId && currentAccountId === account.id) {
            setCurrentAccountId(undefined)
        }
        removeAccount(account.id)
    }

    const onModelDelClick = (model: AccountModel) => {
        if (currentAccount) {
            removeModel(currentAccount.id, model.id)
        }
    }

    const currentDefinition = visibleProviderDefinitions.find(def => def.id === currentAccount?.providerId)
    const selectedDefinition = visibleProviderDefinitions.find(def => def.id === selectedProviderId)
    const defaultApiUrl = selectedDefinition?.defaultApiUrl || ''

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
                                    <DrawerTitle>Add Provider</DrawerTitle>
                                </DrawerHeader>
                                <div id='add-new-provider-drawer' className="px-4 pb-4 app-undragable">
                                    <div className="flex flex-col gap-4">
                                        <div className="flex flex-col items-start gap-2">
                                            <Label htmlFor="provider-name" className="text-sm font-medium">Display Name</Label>
                                            <Input
                                                id="provider-name"
                                                placeholder="OpenAI"
                                                className="focus-visible:ring-transparent focus-visible:ring-offset-0 w-full h-10"
                                                value={newDefinitionDisplayName}
                                                onChange={e => { setNewDefinitionDisplayName(e.target.value) }}
                                            />
                                        </div>
                                        <div className="flex flex-col items-start gap-2">
                                            <Label htmlFor="adapterType" className="text-sm font-medium">Adapter</Label>
                                            <Select value={newDefinitionAdapterType} onValueChange={setNewDefinitionAdapterType}>
                                                <SelectTrigger id="adapterType" className="focus-visible:ring-transparent focus-visible:ring-offset-0 w-full h-10">
                                                    <SelectValue placeholder="Select adapter" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectGroup>
                                                        <SelectItem value="openai">OpenAI Compatible</SelectItem>
                                                        <SelectItem value="claude">Claude Compatible</SelectItem>
                                                    </SelectGroup>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="flex flex-col items-start gap-2">
                                            <Label htmlFor="apiUrl" className="text-sm font-medium">API Base URL</Label>
                                            <Input
                                                id="apiUrl"
                                                placeholder="https://api.openai.com"
                                                className="focus-visible:ring-transparent focus-visible:ring-offset-0 w-full h-10"
                                                value={newProviderApi}
                                                onChange={e => { setNewProviderApi(e.target.value) }}
                                            />
                                        </div>
                                        <div className="flex flex-col items-start gap-2">
                                            <Label htmlFor="apiKey" className="text-sm font-medium">API Key</Label>
                                            <div className="relative w-full">
                                                <Input
                                                    id="apiKey"
                                                    type={showNewApiKey ? "text" : "password"}
                                                    placeholder="sk-********"
                                                    className="focus-visible:ring-transparent focus-visible:ring-offset-0 w-full h-10 pr-10 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                                                    value={newProviderApiKey}
                                                    onChange={e => { setNewProviderApiKey(e.target.value) }}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowNewApiKey(!showNewApiKey)}
                                                    className={cn(
                                                        "absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center p-1 rounded-md",
                                                        "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300",
                                                        "hover:bg-gray-100 dark:hover:bg-gray-600/50",
                                                        "transition-all duration-200",
                                                        "active:scale-90 hover:scale-110"
                                                    )}
                                                    tabIndex={-1}
                                                >
                                                    <span className={cn(
                                                        "transition-all duration-300 ease-in-out",
                                                        showNewApiKey ? "opacity-100 scale-100" : "opacity-0 scale-75 absolute"
                                                    )}>
                                                        <EyeOff className="w-4 h-4" />
                                                    </span>
                                                    <span className={cn(
                                                        "transition-all duration-300 ease-in-out",
                                                        !showNewApiKey ? "opacity-100 scale-100" : "opacity-0 scale-75 absolute"
                                                    )}>
                                                        <Eye className="w-4 h-4" />
                                                    </span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <DrawerFooter className="flex-row gap-2 px-4 pb-4">
                                    <DrawerClose asChild>
                                        <Button variant="outline" className="flex-1 rounded-xl">Cancel</Button>
                                    </DrawerClose>
                                    <DrawerTrigger asChild>
                                        <Button onClick={onAddProviderBtnClick} className="flex-1 rounded-xl">Save</Button>
                                    </DrawerTrigger>
                                </DrawerFooter>
                            </DrawerContent>
                        </Drawer>
                    </div>
                    <div className='flex-1 overflow-y-auto p-2 space-y-1'>
                        <TooltipProvider>
                            {
                                visibleProviderDefinitions.map((definition, idx) => {
                                    const iconKey = definition.iconKey || definition.id
                                    const relatedAccount = accounts.find(account => account.providerId === definition.id)
                                    const isActive = definition.id === selectedProviderId
                                    const accountLabel = relatedAccount?.label

                                    return (
                                    <div
                                        key={definition.id}
                                        className={cn(
                                            'flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer select-none relative group',
                                            'transition-all duration-200 ease-out',
                                            isActive
                                                ? 'bg-gradient-to-r from-blue-50/80 via-blue-50/30 to-transparent dark:from-blue-900/20 dark:via-blue-900/10 dark:to-transparent after:content-[""] after:absolute after:bottom-0.5 after:left-3 after:w-28 after:h-0.5 after:bg-gradient-to-r after:from-blue-500 after:via-blue-400/60 after:to-transparent after:rounded-full hover:from-blue-50/90 hover:via-blue-50/40 dark:hover:from-blue-900/25 dark:hover:via-blue-900/15'
                                                : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                                        )}
                                        onMouseEnter={_ => onProviderCardHover(idx)}
                                        onMouseLeave={_ => onProviderCardHover(-1)}
                                        onClick={_ => onProviderCardClick(definition)}
                                    >
                                        <img
                                            id="providerIcon"
                                            draggable={false}
                                            src={getProviderIcon(iconKey)}
                                            alt={definition.displayName}
                                            className={cn(
                                                "w-5 h-5 flex-none dark:invert dark:brightness-90 transition-all duration-200 ease-out",
                                                hoverProviderCardIdx === idx && "scale-110",
                                                isActive && "scale-125"
                                            )}
                                        />
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <div className="flex-1 min-w-0">
                                                    <p className={cn(
                                                        'truncate font-medium text-sm text-gray-700 dark:text-gray-300 transition-colors duration-200 ease-out',
                                                        hoverProviderCardIdx === idx && 'text-gray-900 dark:text-gray-100'
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
                                                hoverProviderCardIdx === idx &&
                                                    'opacity-100 scale-100 translate-x-0 pointer-events-auto'
                                            )}
                                            onClick={(event) => onProviderDeleteClick(event, definition)}
                                            title="Delete provider"
                                        >
                                            <div className={cn(
                                                'relative p-1.5 rounded-xl',
                                                'bg-rose-50/80 dark:bg-rose-950/40',
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
                                )})
                            }
                        </TooltipProvider>
                    </div>
                </div>
                {/* Provider Details */}
                <div id="providerDetails" className='w-3/4 flex flex-col h-full gap-3 px-2 pt-2'>
                    {!selectedDefinition ? (
                        <div className='flex-1 flex items-center justify-center text-sm text-gray-500 dark:text-gray-400'>
                            No providers available.
                        </div>
                    ) : (
                        <>
                            {/* Provider Configuration Accordion */}
                            <Accordion type="single" collapsible defaultValue="config" className='flex-none'>
                                <AccordionItem value="config" className='border-0'>
                                    <div className='bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200/50 dark:border-gray-700/50 overflow-hidden'>
                                        <AccordionTrigger className={cn(
                                            'px-4 py-2.5 hover:no-underline',
                                            'bg-gradient-to-r from-slate-50/80 to-transparent dark:from-slate-800/40 dark:to-transparent',
                                            'border-b border-gray-200/50 dark:border-gray-700/50',
                                            'transition-all duration-300',
                                            '[&[data-state=open]]:bg-gradient-to-r [&[data-state=open]]:from-blue-50/50 [&[data-state=open]]:to-transparent',
                                            'dark:[&[data-state=open]]:from-blue-900/20 dark:[&[data-state=open]]:to-transparent'
                                        )}>
                                            <div className='flex items-center justify-between w-full mr-2'>
                                                <span className='text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide'>
                                                    Configuration
                                                </span>
                                                <Button
                                                    size="xs"
                                                    variant="ghost"
                                                    className={cn(
                                                        'text-xs h-6 px-2',
                                                        'text-rose-500 hover:text-rose-600',
                                                        'hover:bg-rose-50 dark:hover:bg-rose-950/30',
                                                        'transition-all duration-200',
                                                        'opacity-0 group-hover:opacity-100'
                                                    )}
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        onAccountDeleteClick(e, currentAccount)
                                                    }}
                                                    disabled={!currentAccount}
                                                >
                                                    <i className="ri-refresh-line mr-1 text-xs"></i>
                                                    Reset
                                                </Button>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent className='px-4 pb-3 pt-2'>
                                            <div className='space-y-2'>
                                                <div className='space-y-1'>
                                                    <Label htmlFor="account-label" className='text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide'>
                                                        Label
                                                    </Label>
                                                    <Input
                                                        id="account-label"
                                                        className={cn(
                                                            'h-9 text-sm',
                                                            'bg-slate-50/50 dark:bg-slate-900/30',
                                                            'border-slate-200 dark:border-slate-700',
                                                            'focus-visible:ring-0 focus-visible:ring-offset-0',
                                                            'focus-visible:border-blue-500 dark:focus-visible:border-blue-400',
                                                            'focus-visible:shadow-[0_0_0_3px_rgba(59,130,246,0.1)] dark:focus-visible:shadow-[0_0_0_3px_rgba(96,165,250,0.15)]',
                                                            'transition-all duration-200'
                                                        )}
                                                        placeholder='Provider label'
                                                        value={editAccountLabel}
                                                        onChange={(e) => {
                                                            setEditAccountLabel(e.target.value)
                                                            updateCurrentAccount({ label: e.target.value })
                                                        }}
                                                    />
                                                </div>
                                                <div className='space-y-1'>
                                                    <Label htmlFor="provider-api-url" className='text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide'>
                                                        API Base URL
                                                    </Label>
                                                    <Input
                                                        id="provider-api-url"
                                                        className={cn(
                                                            'h-9 text-sm',
                                                            'bg-slate-50/50 dark:bg-slate-900/30',
                                                            'border-slate-200 dark:border-slate-700',
                                                            'focus-visible:ring-0 focus-visible:ring-offset-0',
                                                            'focus-visible:border-blue-500 dark:focus-visible:border-blue-400',
                                                            'focus-visible:shadow-[0_0_0_3px_rgba(59,130,246,0.1)] dark:focus-visible:shadow-[0_0_0_3px_rgba(96,165,250,0.15)]',
                                                            'transition-all duration-200'
                                                        )}
                                                        placeholder={defaultApiUrl || 'https://api.example.com'}
                                                        value={editAccountApiUrl}
                                                        onChange={(e) => {
                                                            setEditAccountApiUrl(e.target.value)
                                                            updateCurrentAccount({ apiUrl: e.target.value })
                                                        }}
                                                    />
                                                    <p className="text-[10px] text-slate-400 dark:text-slate-500">
                                                        Base URL only • No version path
                                                    </p>
                                                </div>
                                                <div className='space-y-1'>
                                                    <Label htmlFor="provider-api-key" className='text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide'>
                                                        API Key
                                                    </Label>
                                                    <div className="relative w-full">
                                                        <Input
                                                            id="provider-api-key"
                                                            type={showApiKey ? "text" : "password"}
                                                            className={cn(
                                                                'h-9 text-sm pr-10',
                                                                'bg-slate-50/50 dark:bg-slate-900/30',
                                                                'border-slate-200 dark:border-slate-700',
                                                                'focus-visible:ring-0 focus-visible:ring-offset-0',
                                                                'focus-visible:border-blue-500 dark:focus-visible:border-blue-400',
                                                                'focus-visible:shadow-[0_0_0_3px_rgba(59,130,246,0.1)] dark:focus-visible:shadow-[0_0_0_3px_rgba(96,165,250,0.15)]',
                                                                'transition-all duration-200'
                                                            )}
                                                            placeholder='sk-********'
                                                            value={editAccountApiKey}
                                                            onChange={(e) => {
                                                                setEditAccountApiKey(e.target.value)
                                                                updateCurrentAccount({ apiKey: e.target.value })
                                                            }}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowApiKey(!showApiKey)}
                                                            className={cn(
                                                                "absolute right-2 top-1/2 -translate-y-1/2",
                                                                "flex items-center justify-center p-1 rounded-md",
                                                                "text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300",
                                                                "hover:bg-slate-100 dark:hover:bg-slate-700/50",
                                                                "transition-all duration-200",
                                                                "active:scale-90 hover:scale-110"
                                                            )}
                                                            tabIndex={-1}
                                                        >
                                                            <span className={cn(
                                                                "transition-all duration-300 ease-in-out",
                                                                showApiKey ? "opacity-100 scale-100" : "opacity-0 scale-75 absolute"
                                                            )}>
                                                                <EyeOff className="w-3.5 h-3.5" />
                                                            </span>
                                                            <span className={cn(
                                                                "transition-all duration-300 ease-in-out",
                                                                !showApiKey ? "opacity-100 scale-100" : "opacity-0 scale-75 absolute"
                                                            )}>
                                                                <Eye className="w-3.5 h-3.5" />
                                                            </span>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </AccordionContent>
                                    </div>
                                </AccordionItem>
                            </Accordion>
                            {/* Models List */}
                            <div className='flex-1 flex justify-between flex-col overflow-hidden bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200/50 dark:border-gray-700/50'>
                                <div className='flex justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50'>
                                    <h3 className='text-sm font-medium flex items-center text-gray-700 dark:text-gray-300'>Models</h3>
                                    <Button
                                        size="xs"
                                        variant="ghost"
                                        className={cn(
                                            'group relative rounded-xl text-[11px] font-semibold tracking-tight',
                                            'px-3 py-2 h-auto',
                                            'text-slate-600 dark:text-slate-400',
                                            'bg-white dark:bg-slate-900',
                                            'dark:hover:bg-slate-800',
                                            'hover:text-slate-900 dark:hover:text-slate-100',
                                            'active:scale-95',
                                            'transition-all duration-200',
                                            'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-slate-900',
                                            'disabled:hover:border-slate-300 dark:disabled:hover:border-slate-700',
                                            'disabled:hover:shadow-sm disabled:hover:text-slate-600 dark:disabled:hover:text-slate-400'
                                        )}
                                        onClick={() => setShowFetchModelsDrawer(true)}
                                        disabled={!currentAccount?.apiKey}
                                    >
                                        <i className={cn(
                                            "ri-download-cloud-line mr-1.5 text-sm",
                                            "transition-all duration-300",
                                        )}></i>
                                        Fetch Models
                                    </Button>
                                </div>
                                <div className='flex-1 overflow-y-auto scroll-smooth [&>div]:!overflow-visible'>
                                    <TooltipProvider>
                                        <Table id="provider-models-table" className='relative'>
                                            <TableHeader className='sticky top-0 z-10 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700'>
                                                <TableRow className='border-none hover:bg-transparent'>
                                                    <TableHead className='px-4 py-3 text-[11px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider'>Name</TableHead>
                                                    <TableHead className='px-4 py-3 text-[11px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider'>Model ID</TableHead>
                                                    <TableHead className='px-4 py-3 text-[11px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider text-center'>Type</TableHead>
                                                    <TableHead className='px-4 py-3 text-[11px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider text-center'>Status</TableHead>
                                                    <TableHead className='px-4 py-3 text-[11px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider text-center'>Action</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {/* Add New Model Row */}
                                                <TableRow className='border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/70 transition-colors duration-200'>
                                                    <TableCell className='px-3 py-3 w-[40%]'>
                                                        <div className="relative">
                                                            <Input
                                                                className={cn(
                                                                    'h-9 text-sm font-medium',
                                                                    'border-0 border-b-2 border-slate-300 dark:border-slate-600',
                                                                    'rounded-none px-2',
                                                                    'bg-transparent dark:bg-transparent',
                                                                    'text-slate-700 dark:text-slate-200',
                                                                    'placeholder:text-slate-400 dark:placeholder:text-slate-500',
                                                                    'outline-none focus:outline-none focus-visible:outline-none',
                                                                    'focus-visible:ring-0 focus-visible:ring-offset-0',
                                                                    'focus-visible:border-b-blue-500 dark:focus-visible:border-b-blue-400',
                                                                    'transition-all duration-200',
                                                                    'shadow-none focus-visible:shadow-none'
                                                                )}
                                                                value={nextAddModelLabel}
                                                                onChange={e => setNextAddModelLabel(e.target.value)}
                                                                placeholder="ModelName"
                                                            />
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className='px-3 py-3 w-[40%]'>
                                                        <div className="relative">
                                                            <Input
                                                                className={cn(
                                                                    'h-9 text-sm font-medium',
                                                                    'border-0 border-b-2 border-slate-300 dark:border-slate-600',
                                                                    'rounded-none px-2',
                                                                    'bg-transparent dark:bg-transparent',
                                                                    'text-slate-700 dark:text-slate-200',
                                                                    'placeholder:text-slate-400 dark:placeholder:text-slate-500',
                                                                    'outline-none focus:outline-none focus-visible:outline-none',
                                                                    'focus-visible:ring-0 focus-visible:ring-offset-0',
                                                                    'focus-visible:border-b-blue-500 dark:focus-visible:border-b-blue-400',
                                                                    'transition-all duration-200',
                                                                    'shadow-none focus-visible:shadow-none'
                                                                )}
                                                                value={nextAddModelValue}
                                                                onChange={e => setNextAddModelValue(e.target.value)}
                                                                placeholder="ModelID"
                                                            />
                                                        </div>
                                                    </TableCell>
                                                    <TableCell colSpan={2} className='px-4 py-3'>
                                                        <Select value={nextAddModelType} onValueChange={setNextAddModelType}>
                                                            <SelectTrigger className={cn(
                                                                'h-9 text-sm font-medium',
                                                                'border-0 border-b-2 border-slate-300 dark:border-slate-600',
                                                                'rounded-none px-2',
                                                                'bg-transparent dark:bg-transparent',
                                                                'text-slate-700 dark:text-slate-200',
                                                                'outline-none focus:outline-none focus-visible:outline-none',
                                                                'focus:ring-0 focus:ring-offset-0',
                                                                'focus:border-b-blue-500 dark:focus:border-b-blue-400',
                                                                'transition-all duration-200',
                                                                'shadow-none'
                                                            )}>
                                                                <SelectValue placeholder="Type" className="placeholder:text-slate-400 dark:placeholder:text-slate-500" />
                                                            </SelectTrigger>
                                                            <SelectContent className="bg-white/20 rounded-2xl shadow-sm backdrop-blur-lg text-gray-400 dark:text-gray-300 font-medium tracking-wider">
                                                                <SelectGroup defaultValue={'llm'}>
                                                                    <SelectItem value="llm" className="rounded-lg">LLM</SelectItem>
                                                                    <SelectItem value="vlm" className="rounded-lg">VLM</SelectItem>
                                                                    <SelectItem value="t2i" className="rounded-lg">T2I</SelectItem>
                                                                </SelectGroup>
                                                            </SelectContent>
                                                        </Select>
                                                    </TableCell>
                                                    <TableCell className='px-4 py-3 text-center'>
                                                        <Button
                                                            onClick={onAddModelClick}
                                                            size={'sm'}
                                                            variant={'default'}
                                                            className='h-7 px-3 rounded-3xl text-xs transition-transform duration-200 hover:scale-105 active:scale-95'
                                                        >
                                                            <i className="ri-add-circle-line mr-1 text-sm"></i>
                                                            Add
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                                {/* Model List */}
                                                {
                                                    currentAccount?.models.map((m, idx) => (
                                                        <TableRow
                                                            key={idx}
                                                            style={{
                                                                animationDelay: `${idx * 40}ms`,
                                                                animationFillMode: 'both'
                                                            }}
                                                            className={cn(
                                                                'border-b border-gray-200/60 dark:border-gray-700/60 transition-all duration-200 ease-out group/row',
                                                                'hover:bg-gray-50 dark:hover:bg-gray-700/40',
                                                                'hover:border-gray-300 dark:hover:border-gray-600',
                                                                'animate-in fade-in slide-in-from-bottom-1',
                                                                idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50/30 dark:bg-gray-800/40'
                                                            )}
                                                        >
                                                            <TableCell className='px-4 py-3 text-left max-w-0'>
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <p
                                                                            className='truncate text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:text-gray-900 dark:hover:text-gray-100 transition-colors duration-150'
                                                                            onClick={_ => onModelTableCellClick(m.label)}
                                                                        >
                                                                            {m.label}
                                                                        </p>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent>
                                                                        <p>{m.label}</p>
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                            </TableCell>
                                                            <TableCell className='px-4 py-3 text-left max-w-0'>
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <p
                                                                            className='truncate text-[13px] text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-gray-200 transition-colors duration-150'
                                                                            onClick={_ => onModelTableCellClick(m.id)}
                                                                        >
                                                                            {m.id}
                                                                        </p>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent>
                                                                        <p>{m.id}</p>
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                            </TableCell>
                                                            <TableCell className='px-4 py-3 text-center'>
                                                                <Badge variant="secondary" className='text-[10px] font-medium uppercase px-2 py-0.5'>
                                                                    {m.type}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className='px-4 py-3 text-center'>
                                                                <div className='inline-flex items-center justify-center'>
                                                                    <Switch
                                                                        className='h-6 transition-all duration-200'
                                                                        checked={m.enabled !== false}
                                                                        onCheckedChange={checked => onModelEnableStatusChange(checked, m)}
                                                                    />
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className='px-4 py-3 text-center'>
                                                                <button
                                                                    onClick={_ => onModelDelClick(m)}
                                                                    className='inline-flex items-center justify-center p-1.5 rounded-md text-red-400 dark:text-red-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-200 hover:scale-110 active:scale-90 group/del'
                                                                    title="Delete model"
                                                                >
                                                                    <Trash className='w-4 h-4 group-hover/del:animate-[wiggle_0.3s_ease-in-out]' />
                                                                </button>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))
                                                }
                                                {/* Empty State */}
                                                {currentAccount?.models.length === 0 && (
                                                    <TableRow>
                                                        <TableCell colSpan={5} className='px-4 py-12 text-center'>
                                                            <div className='flex flex-col items-center justify-center text-gray-400 dark:text-gray-500'>
                                                                <i className="ri-inbox-line text-4xl mb-2 opacity-40"></i>
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
                        </>
                    )}
                </div>
            </div>

            {/* Fetch Models Drawer */}
            <FetchModelsDrawer
                open={showFetchModelsDrawer}
                onOpenChange={setShowFetchModelsDrawer}
                currentAccount={currentAccount}
                providerDefinition={currentDefinition}
                addModel={addModel}
            />
        </div>
    )
}

export default ProvidersManagerNext

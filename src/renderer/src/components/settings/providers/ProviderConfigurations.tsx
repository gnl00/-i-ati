import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
import {
  Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@renderer/components/ui/select'
import { cn } from '@renderer/lib/utils'
import { getProviderIcon } from '@renderer/utils/providerIcons'
import { getRequestAdapterOptionsFromPlugins } from '@shared/plugins/requestAdapters'
import { listRequestPayloadExtensionsByFeature } from '@shared/plugins/requestPayloadExtensions'
import type { ProviderTestConnectionResponse } from '@shared/providers/testConnection'
import { Eye, EyeOff, LoaderCircle, TestTube2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ProviderAdvanceConfigDrawer } from '@renderer/components/settings/providers/ProviderAdvanceConfigDrawer'
import { ProviderIconConfigDrawer } from '@renderer/components/settings/providers/ProviderIconConfigDrawer'
import { toast } from 'sonner'
import {
    settingsDangerButtonClassName,
    settingsOutlineButtonClassName,
    settingsSecondaryButtonClassName
} from '../common/SettingsLayout'

interface ProviderConfigurationsProps {
    plugins?: PluginEntity[]
    providerDefinition?: ProviderDefinition
    account?: ProviderAccount
    defaultApiUrl?: string
    onUpdateAccount: (updates: Partial<ProviderAccount>) => void
    onUpdateProviderDefinition: (providerId: string, updates: Partial<ProviderDefinition>) => void
    onTestProvider: () => Promise<ProviderTestConnectionResponse>
    onResetAccount: () => void
}

const providerConfigInputClassName = cn(
    'h-8 rounded-lg border-transparent bg-gray-100/80 text-[12.5px] shadow-inner',
    'ring-1 ring-inset ring-gray-200/80',
    'placeholder:text-gray-400/80',
    'transition-[background-color,box-shadow,color,border-color] duration-150',
    'hover:bg-gray-100 hover:ring-gray-300/80',
    'focus-visible:border-gray-300 focus-visible:ring-1 focus-visible:ring-gray-400/70 focus-visible:ring-offset-0',
    'disabled:cursor-not-allowed disabled:opacity-50',
    'dark:bg-gray-950/45 dark:ring-gray-800/80 dark:placeholder:text-gray-600',
    'dark:hover:bg-gray-950/60 dark:hover:ring-gray-700/90',
    'dark:focus-visible:border-gray-700 dark:focus-visible:ring-gray-600/80'
)

const providerConfigSelectTriggerClassName = cn(
    'h-8 w-full rounded-lg border border-gray-200/85 bg-white/90 text-[12.5px] shadow-xs',
    'text-gray-800 transition-[background-color,border-color,box-shadow,color] duration-150',
    'hover:border-gray-300/90 hover:bg-gray-50/95 hover:shadow-sm',
    'focus-visible:border-gray-300 focus-visible:ring-1 focus-visible:ring-gray-400/70 focus-visible:ring-offset-0',
    'data-[state=open]:border-gray-400/80 data-[state=open]:bg-white data-[state=open]:shadow-sm',
    'disabled:cursor-not-allowed disabled:opacity-50',
    '[&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:text-gray-400 [&>svg]:opacity-80',
    'dark:border-gray-800/90 dark:bg-gray-900/70 dark:text-gray-100 dark:shadow-none',
    'dark:hover:border-gray-700/90 dark:hover:bg-gray-900/90',
    'dark:focus-visible:border-gray-700 dark:focus-visible:ring-gray-600/80',
    'dark:data-[state=open]:border-gray-600/90 dark:data-[state=open]:bg-gray-900',
    'dark:[&>svg]:text-gray-500'
)

const providerRevealButtonClassName = cn(
    'absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md',
    'text-gray-400 transition-[background-color,color,box-shadow,transform] duration-150',
    'hover:bg-gray-200/70 hover:text-gray-700',
    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400/70',
    'active:scale-[0.96]',
    'dark:text-gray-500 dark:hover:bg-gray-800/70 dark:hover:text-gray-200',
    'dark:focus-visible:ring-gray-600/80'
)

const providerFieldLabelClassName = cn(
    'text-[10.5px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500'
)

const NO_THINKING_PAYLOAD_EXTENSION = 'none'

const ProviderConfigurations = ({
    plugins,
    providerDefinition,
    account,
    defaultApiUrl,
    onUpdateAccount,
    onUpdateProviderDefinition,
    onTestProvider,
    onResetAccount
}: ProviderConfigurationsProps) => {
    const [label, setLabel] = useState<string>(account?.label ?? '')
    const [apiUrl, setApiUrl] = useState<string>(account?.apiUrl ?? '')
    const [apiKey, setApiKey] = useState<string>(account?.apiKey ?? '')
    const [showApiKey, setShowApiKey] = useState<boolean>(false)
    const [payloadDrawerOpen, setPayloadDrawerOpen] = useState<boolean>(false)
    const [iconDrawerOpen, setIconDrawerOpen] = useState<boolean>(false)
    const [isTestingProvider, setIsTestingProvider] = useState<boolean>(false)

    useEffect(() => {
        setLabel(account?.label ?? '')
        setApiUrl(account?.apiUrl ?? '')
        setApiKey(account?.apiKey ?? '')
    }, [account?.id, account?.label, account?.apiUrl, account?.apiKey])

    useEffect(() => {
        if (!providerDefinition) {
            setPayloadDrawerOpen(false)
            setIconDrawerOpen(false)
        }
        setIsTestingProvider(false)
    }, [providerDefinition?.id])

    const adapterOptions = useMemo(() => {
        return getRequestAdapterOptionsFromPlugins(plugins)
    }, [plugins])
    const thinkingPayloadExtensions = useMemo(() => {
        return listRequestPayloadExtensionsByFeature('thinking')
    }, [])

    const currentAdapterOption = adapterOptions.find(option => option.pluginId === (providerDefinition?.adapterPluginId ?? 'openai-chat-compatible-adapter'))
    const currentAdapterDisabled = Boolean(currentAdapterOption && !currentAdapterOption.enabled)
    const selectedThinkingPayloadExtensionId = providerDefinition?.payloadExtensions?.thinking ?? NO_THINKING_PAYLOAD_EXTENSION
    const selectedThinkingPayloadExtension = thinkingPayloadExtensions.find(extension => extension.id === selectedThinkingPayloadExtensionId)
    const providerEnabled = providerDefinition?.enabled !== false
    const providerIconSrc = getProviderIcon(providerDefinition?.iconKey || providerDefinition?.id)
    const canTestProvider = Boolean(
        providerDefinition
        && account
        && account.apiUrl.trim()
        && account.apiKey.trim()
        && account.models.some(model => model.enabled === true)
    )

    const handleTestProvider = async () => {
        if (!canTestProvider || isTestingProvider) return

        setIsTestingProvider(true)
        try {
            const result = await onTestProvider()
            if (result.ok) {
                toast.success(`Provider responded with ${result.modelId}`)
                return
            }
            toast.error(result.error || 'Provider test failed')
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Provider test failed')
        } finally {
            setIsTestingProvider(false)
        }
    }

    return (
        <div className='px-3 py-2 border-b border-gray-200/70 dark:border-gray-700/60 space-y-1.5'>
            {/* Header */}
            <div className='flex items-center justify-between gap-3'>
                <h3 className='text-[13.5px] font-semibold tracking-tight text-gray-900 dark:text-gray-100'>
                    {providerDefinition?.displayName || 'Provider'}
                </h3>
                <div className='flex items-center gap-2'>
                    <button
                        type="button"
                        disabled={!canTestProvider || isTestingProvider}
                        onClick={handleTestProvider}
                        className={cn(settingsSecondaryButtonClassName, 'h-6 px-2')}
                    >
                        {isTestingProvider ? (
                            <LoaderCircle className="h-3 w-3 animate-spin" />
                        ) : (
                            <TestTube2 className="h-3 w-3" />
                        )}
                        {isTestingProvider ? 'Testing' : 'Test'}
                    </button>
                    <button
                        type="button"
                        disabled={!account}
                        onClick={onResetAccount}
                        className={cn(settingsDangerButtonClassName, 'h-6 px-2 border-transparent')}
                    >
                        <i className="ri-refresh-line text-[11px]"></i>
                        Reset
                    </button>
                    <div className='h-5 w-px bg-gray-200 dark:bg-gray-700' />
                    <div className='flex items-center gap-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400 select-none'>
                        <span>{providerEnabled ? 'Enabled' : 'Disabled'}</span>
                        <Switch
                            aria-label="Toggle provider availability"
                            checked={providerEnabled}
                            disabled={!providerDefinition}
                            onCheckedChange={(checked) => {
                                if (!providerDefinition) return
                                onUpdateProviderDefinition(providerDefinition.id, { enabled: checked })
                            }}
                            className={cn(
                                'h-[18px] w-[32px] border-0 focus-visible:ring-gray-300 dark:focus-visible:ring-gray-600',
                                'data-[state=checked]:bg-gray-900 dark:data-[state=checked]:bg-gray-100',
                                'data-[state=unchecked]:bg-gray-200 dark:data-[state=unchecked]:bg-gray-700',
                                '[&>span]:h-[14px] [&>span]:w-[14px] [&>span]:data-[state=checked]:translate-x-[14px] [&>span]:data-[state=unchecked]:translate-x-[2px]',
                                '[&>span]:bg-white dark:[&>span]:bg-gray-900 [&>span]:shadow-sm'
                            )}
                        />
                    </div>
                </div>
            </div>

            {/* Fields grid */}
            <div className='grid grid-cols-1 md:grid-cols-2 gap-x-2.5 gap-y-2'>
                <div className='md:col-span-2 space-y-1 min-w-0'>
                    <Label htmlFor="account-label" className={providerFieldLabelClassName}>
                        Label
                    </Label>
                    <Input
                        id="account-label"
                        className={providerConfigInputClassName}
                        placeholder='Provider label'
                        value={label}
                        onChange={(event) => {
                            const value = event.target.value
                            setLabel(value)
                            onUpdateAccount({ label: value })
                        }}
                    />
                </div>

                <div className='space-y-1 min-w-0'>
                    <Label className={providerFieldLabelClassName}>
                        Adapter
                    </Label>
                    <Select
                        value={providerDefinition?.adapterPluginId ?? 'openai-chat-compatible-adapter'}
                        onValueChange={(value) => {
                            if (!providerDefinition) return
                            onUpdateProviderDefinition(providerDefinition.id, {
                                adapterPluginId: value
                            })
                        }}
                        disabled={!providerDefinition}
                    >
                        <SelectTrigger
                            onClick={(event) => event.stopPropagation()}
                            onPointerDown={(event) => event.stopPropagation()}
                            className={providerConfigSelectTriggerClassName}
                        >
                            <SelectValue placeholder="Select adapter" />
                        </SelectTrigger>
                        <SelectContent className='bg-white/95 dark:bg-gray-900/95 rounded-lg shadow-xs backdrop-blur font-medium'>
                            {adapterOptions.map(option => (
                                <SelectItem
                                    key={option.pluginId}
                                    value={option.pluginId}
                                    disabled={!option.enabled}
                                    className='text-[11px] tracking-tight'
                                >
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {currentAdapterDisabled && (
                        <p className='rounded-md bg-amber-50/80 px-2 py-1 text-[10.5px] font-medium leading-snug text-amber-700 ring-1 ring-inset ring-amber-200/80 dark:bg-amber-950/20 dark:text-amber-300 dark:ring-amber-900/60'>
                            Adapter plugin is disabled. Re-enable it in Plugins or choose an enabled adapter.
                        </p>
                    )}
                </div>

                <div className='space-y-1 min-w-0'>
                    <Label className={providerFieldLabelClassName}>
                        Thinking Payload
                    </Label>
                    <Select
                        value={selectedThinkingPayloadExtensionId}
                        onValueChange={(value) => {
                            if (!providerDefinition) return
                            onUpdateProviderDefinition(providerDefinition.id, {
                                payloadExtensions: value === NO_THINKING_PAYLOAD_EXTENSION
                                    ? undefined
                                    : {
                                        ...(providerDefinition.payloadExtensions ?? {}),
                                        thinking: value
                                    }
                            })
                        }}
                        disabled={!providerDefinition}
                    >
                        <SelectTrigger
                            onClick={(event) => event.stopPropagation()}
                            onPointerDown={(event) => event.stopPropagation()}
                            className={providerConfigSelectTriggerClassName}
                        >
                            <SelectValue placeholder="Select thinking payload" />
                        </SelectTrigger>
                        <SelectContent className='bg-white/95 dark:bg-gray-900/95 rounded-lg shadow-xs backdrop-blur font-medium'>
                            <SelectItem
                                value={NO_THINKING_PAYLOAD_EXTENSION}
                                className='text-[11px] tracking-tight'
                            >
                                None
                            </SelectItem>
                            {thinkingPayloadExtensions.map(extension => (
                                <SelectItem
                                    key={extension.id}
                                    value={extension.id}
                                    className='text-[11px] tracking-tight'
                                >
                                    {extension.label}
                                </SelectItem>
                            ))}
                            {selectedThinkingPayloadExtensionId !== NO_THINKING_PAYLOAD_EXTENSION && !selectedThinkingPayloadExtension && (
                                <SelectItem
                                    value={selectedThinkingPayloadExtensionId}
                                    className='text-[11px] tracking-tight'
                                >
                                    {selectedThinkingPayloadExtensionId}
                                </SelectItem>
                            )}
                        </SelectContent>
                    </Select>
                </div>

                <div className='md:col-span-2 space-y-1'>
                    <Label htmlFor="provider-api-url" className='flex items-baseline gap-1.5 text-[10.5px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500'>
                        API Base URL
                        <span className='text-[10px] normal-case tracking-tight text-gray-400/70 dark:text-gray-500 select-none'>
                            Adapter adds the endpoint path.
                        </span>
                    </Label>
                    <Input
                        id="provider-api-url"
                        className={providerConfigInputClassName}
                        placeholder={defaultApiUrl || 'https://api.example.com'}
                        value={apiUrl}
                        onChange={(event) => {
                            const value = event.target.value
                            setApiUrl(value)
                            onUpdateAccount({ apiUrl: value })
                        }}
                    />
                </div>

                <div className='md:col-span-2 space-y-1'>
                    <Label htmlFor="provider-api-key" className={providerFieldLabelClassName}>
                        API Key
                    </Label>
                    <div className='relative w-full'>
                        <Input
                            id="provider-api-key"
                            type={showApiKey ? 'text' : 'password'}
                            className={cn(providerConfigInputClassName, 'pr-9')}
                            placeholder='sk-********'
                            value={apiKey}
                            onChange={(event) => {
                                const value = event.target.value
                                setApiKey(value)
                                onUpdateAccount({ apiKey: value })
                            }}
                        />
                        <button
                            type="button"
                            onClick={() => setShowApiKey(!showApiKey)}
                            aria-label={showApiKey ? 'Hide API key' : 'Reveal API key'}
                            aria-pressed={showApiKey}
                            className={providerRevealButtonClassName}
                        >
                            <span className={cn(
                                'transition-all duration-300 ease-in-out',
                                showApiKey ? 'opacity-100 scale-100' : 'opacity-0 scale-75 absolute'
                            )}>
                                <EyeOff className="w-3.5 h-3.5" />
                            </span>
                            <span className={cn(
                                'transition-all duration-300 ease-in-out',
                                !showApiKey ? 'opacity-100 scale-100' : 'opacity-0 scale-75 absolute'
                            )}>
                                <Eye className="w-3.5 h-3.5" />
                            </span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Header actions — flat row */}
            <div className='flex flex-wrap items-center justify-start gap-x-3 gap-y-2 pt-0.5'>
                <div className='flex items-center justify-start space-x-2'>
                    <span className='text-[10.5px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider'>
                        Request Payload
                    </span>
                    <ProviderAdvanceConfigDrawer
                        open={payloadDrawerOpen}
                        onOpenChange={setPayloadDrawerOpen}
                        providerDefinition={providerDefinition}
                        onSave={(payload) => {
                            if (!providerDefinition) return
                            onUpdateProviderDefinition(providerDefinition.id, {
                                requestOverrides: payload
                            })
                        }}
                        trigger={
                            <button
                                type="button"
                                disabled={!providerDefinition}
                                className={cn(
                                    settingsOutlineButtonClassName,
                                    'h-6 px-2 shrink-0'
                                )}
                            >
                                <i className="ri-code-line text-[11px]" />
                                Configure
                            </button>
                        }
                    />
                </div>
                <div className='flex items-center justify-start space-x-2'>
                    <span className='text-[10.5px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider'>
                        Icon
                    </span>
                    <ProviderIconConfigDrawer
                        open={iconDrawerOpen}
                        onOpenChange={setIconDrawerOpen}
                        providerDefinition={providerDefinition}
                        onSave={(iconKey) => {
                            if (!providerDefinition) return
                            onUpdateProviderDefinition(providerDefinition.id, {
                                iconKey
                            })
                        }}
                        trigger={
                            <button
                                type="button"
                                disabled={!providerDefinition}
                                className={cn(
                                    settingsOutlineButtonClassName,
                                    'h-6 px-2 shrink-0'
                                )}
                            >
                                <img
                                    src={providerIconSrc}
                                    alt=""
                                    className="h-3 w-3 select-none dark:invert dark:brightness-90"
                                    draggable={false}
                                />
                                Configure
                            </button>
                        }
                    />
                </div>
            </div>
        </div>
    )
}

export default ProviderConfigurations

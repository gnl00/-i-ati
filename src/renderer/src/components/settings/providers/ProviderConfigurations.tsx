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
import { getRequestAdapterOptionsFromPlugins } from '@shared/plugins/requestAdapters'
import { Eye, EyeOff } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ProviderAdvanceConfigDrawer } from '@renderer/components/settings/providers/ProviderAdvanceConfigDrawer'

interface ProviderConfigurationsProps {
    plugins?: PluginEntity[]
    providerDefinition?: ProviderDefinition
    account?: ProviderAccount
    defaultApiUrl?: string
    onUpdateAccount: (updates: Partial<ProviderAccount>) => void
    onUpdateProviderDefinition: (providerId: string, updates: Partial<ProviderDefinition>) => void
    onResetAccount: () => void
}

const fieldClassName = cn(
    'h-8 text-[12.5px]',
    'bg-white dark:bg-gray-800/60',
    'border-gray-200 dark:border-gray-700',
    'focus-visible:ring-2 focus-visible:ring-gray-300/80 dark:focus-visible:ring-gray-600/80 focus-visible:ring-offset-0',
    'focus-visible:border-gray-400 dark:focus-visible:border-gray-500',
    'transition-colors duration-150'
)

const ProviderConfigurations = ({
    plugins,
    providerDefinition,
    account,
    defaultApiUrl,
    onUpdateAccount,
    onUpdateProviderDefinition,
    onResetAccount
}: ProviderConfigurationsProps) => {
    const [label, setLabel] = useState<string>(account?.label ?? '')
    const [apiUrl, setApiUrl] = useState<string>(account?.apiUrl ?? '')
    const [apiKey, setApiKey] = useState<string>(account?.apiKey ?? '')
    const [showApiKey, setShowApiKey] = useState<boolean>(false)
    const [payloadDrawerOpen, setPayloadDrawerOpen] = useState<boolean>(false)

    useEffect(() => {
        setLabel(account?.label ?? '')
        setApiUrl(account?.apiUrl ?? '')
        setApiKey(account?.apiKey ?? '')
    }, [account?.id, account?.label, account?.apiUrl, account?.apiKey])

    useEffect(() => {
        if (!providerDefinition) {
            setPayloadDrawerOpen(false)
        }
    }, [providerDefinition?.id])

    const adapterOptions = useMemo(() => {
        return getRequestAdapterOptionsFromPlugins(plugins)
    }, [plugins])

    const currentAdapterOption = adapterOptions.find(option => option.pluginId === (providerDefinition?.adapterPluginId ?? 'openai-chat-compatible-adapter'))
    const currentAdapterDisabled = Boolean(currentAdapterOption && !currentAdapterOption.enabled)
    const providerEnabled = providerDefinition?.enabled !== false

    return (
        <div className='px-4 pt-3 pb-2.5 border-b border-gray-200/70 dark:border-gray-700/60 space-y-2.5'>
            {/* Header */}
            <div className='flex items-center justify-between gap-3'>
                <h3 className='text-[13.5px] font-semibold tracking-tight text-gray-900 dark:text-gray-100'>
                    {providerDefinition?.displayName || 'Provider'}
                </h3>
                <div className='flex items-center gap-2'>
                    <button
                        type="button"
                        disabled={!account}
                        onClick={onResetAccount}
                        className='h-6 px-2 flex items-center gap-1 rounded-md text-[11px] font-medium text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-40 transition-colors duration-150'
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
            <div className='grid grid-cols-2 gap-x-2.5 gap-y-2'>
                <div className='space-y-1'>
                    <Label htmlFor="account-label" className='text-[10.5px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider'>
                        Label
                    </Label>
                    <Input
                        id="account-label"
                        className={fieldClassName}
                        placeholder='Provider label'
                        value={label}
                        onChange={(event) => {
                            const value = event.target.value
                            setLabel(value)
                            onUpdateAccount({ label: value })
                        }}
                    />
                </div>

                <div className='space-y-1'>
                    <Label className='text-[10.5px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider'>
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
                            className={cn(fieldClassName, 'w-full', 'focus:ring-2 focus:ring-gray-300/80 dark:focus:ring-gray-600/80 focus:ring-offset-0 focus:border-gray-400 dark:focus:border-gray-500')}
                        >
                            <SelectValue placeholder="Select adapter" />
                        </SelectTrigger>
                        <SelectContent className='bg-white/20 rounded-lg shadow-xs backdrop-blur-3xl font-medium'>
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
                        <p className='text-[10.5px] text-amber-600 dark:text-amber-400 leading-relaxed'>
                            This provider is using a disabled adapter plugin. Re-enable it in Plugins or switch to another adapter before requesting.
                        </p>
                    )}
                </div>

                <div className='col-span-2 space-y-1'>
                    <Label htmlFor="provider-api-url" className='text-[10.5px] font-medium text-gray-400 dark:text-gray-500 tracking-wider'>
                        API URL &nbsp;
                        <span className='text-[10px] tracking-tight text-gray-400/70 dark:text-gray-500 mt-0.5 select-none'>
                            Base URL only · Endpoint path handled by adapter
                        </span>
                    </Label>
                    <Input
                        id="provider-api-url"
                        className={fieldClassName}
                        placeholder={defaultApiUrl || 'https://api.example.com'}
                        value={apiUrl}
                        onChange={(event) => {
                            const value = event.target.value
                            setApiUrl(value)
                            onUpdateAccount({ apiUrl: value })
                        }}
                    />
                </div>

                <div className='col-span-2 space-y-1'>
                    <Label htmlFor="provider-api-key" className='text-[10.5px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider'>
                        API Key
                    </Label>
                    <div className='relative w-full'>
                        <Input
                            id="provider-api-key"
                            type={showApiKey ? 'text' : 'password'}
                            className={cn(fieldClassName, 'pr-9')}
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
                            className={cn(
                                'absolute right-2 top-1/2 -translate-y-1/2',
                                'flex items-center justify-center p-1 rounded',
                                'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300',
                                'hover:bg-gray-100 dark:hover:bg-gray-700/50',
                                'transition-colors duration-150'
                            )}
                            tabIndex={-1}
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

            {/* Request Payload — flat row */}
            <div className='flex items-center justify-start space-x-2 pt-0.5'>
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
                                'h-6 px-2 flex items-center gap-1 rounded-md shrink-0',
                                'text-[11px] font-medium',
                                'text-gray-500 dark:text-gray-400',
                                'border border-gray-200 dark:border-gray-700',
                                'hover:text-gray-800 dark:hover:text-gray-100',
                                'hover:bg-gray-50 dark:hover:bg-gray-700/50',
                                'hover:border-gray-300 dark:hover:border-gray-600',
                                'disabled:opacity-40 disabled:pointer-events-none',
                                'transition-colors duration-150'
                            )}
                        >
                            <i className="ri-code-line text-[11px]" />
                            Configure
                        </button>
                    }
                />
            </div>
        </div>
    )
}

export default ProviderConfigurations

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@renderer/components/ui/accordion'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { cn } from '@renderer/lib/utils'
import { ChevronDown, Eye, EyeOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ProviderAdvanceConfigDrawer } from '@renderer/components/settings/providers/ProviderAdvanceConfigDrawer'

interface ProviderConfigurationsProps {
    providerDefinition?: ProviderDefinition
    account?: ProviderAccount
    defaultApiUrl?: string
    onUpdateAccount: (updates: Partial<ProviderAccount>) => void
    onUpdateProviderDefinition: (providerId: string, updates: Partial<ProviderDefinition>) => void
    onResetAccount: () => void
}

const ProviderConfigurations = ({
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
    return (
        <Accordion type="single" collapsible defaultValue="config" className='flex-none'>
            <AccordionItem value="config" className='border-0'>
                <div className='bg-white dark:bg-gray-800 rounded-lg shadow-xs border border-gray-200/50 dark:border-gray-700/50 overflow-hidden'>
                    <AccordionTrigger className={cn(
                        'px-4 py-2.5 hover:no-underline',
                        'bg-linear-to-r from-slate-50/80 to-transparent dark:from-slate-800/40 dark:to-transparent',
                        'border-b border-gray-200/50 dark:border-gray-700/50',
                        'transition-all duration-300',
                        'data-[state=open]:bg-linear-to-r data-[state=open]:from-blue-50/50 data-[state=open]:to-transparent',
                        'dark:data-[state=open]:from-blue-900/20 dark:data-[state=open]:to-transparent'
                    , 'group')}>
                        <div className='flex items-center justify-between w-full mr-2'>
                            <div className='flex items-center gap-2'>
                                <span className='text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide'>
                                    Configuration
                                </span>
                                <ChevronDown className={cn(
                                    'h-4 w-4 text-gray-500 dark:text-gray-400 transition-transform duration-200',
                                    'group-data-[state=open]:rotate-180'
                                )} />
                            </div>
                            <div
                                role="button"
                                tabIndex={0}
                                className={cn(
                                    'text-xs h-6 px-2 rounded-md',
                                    'inline-flex items-center justify-center',
                                    'text-rose-500 hover:text-rose-600',
                                    'hover:bg-rose-50 dark:hover:bg-rose-950/30',
                                    'transition-all duration-200',
                                    'opacity-0 group-hover:opacity-100',
                                    !account && 'pointer-events-none opacity-40'
                                )}
                                onClick={(event) => {
                                    event.stopPropagation()
                                    if (!account) return
                                    onResetAccount()
                                }}
                                onKeyDown={(event) => {
                                    if (event.key !== 'Enter' && event.key !== ' ') return
                                    event.preventDefault()
                                    event.stopPropagation()
                                    if (!account) return
                                    onResetAccount()
                                }}
                            >
                                <i className="ri-refresh-line mr-1 text-xs"></i>
                                Reset
                            </div>
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
                                    value={label}
                                    onChange={(event) => {
                                        const value = event.target.value
                                        setLabel(value)
                                        onUpdateAccount({ label: value })
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
                                    value={apiUrl}
                                    onChange={(event) => {
                                        const value = event.target.value
                                        setApiUrl(value)
                                        onUpdateAccount({ apiUrl: value })
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
                            <div className='pt-1'>
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
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className={cn(
                                                'h-8 rounded-full px-3 text-[11px] font-semibold',
                                                'text-slate-600 dark:text-slate-400',
                                                'hover:bg-slate-100 dark:hover:bg-slate-800',
                                                'border border-transparent hover:border-slate-200 dark:hover:border-slate-700'
                                            )}
                                            disabled={!providerDefinition}
                                        >
                                            <i className="ri-code-line mr-1.5 text-sm"></i>
                                            Request Payload
                                        </Button>
                                    }
                                />
                            </div>
                        </div>
                    </AccordionContent>
                </div>
            </AccordionItem>
        </Accordion>
    )
}

export default ProviderConfigurations

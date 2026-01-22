import React, { useEffect, useMemo, useState } from 'react'
import { useAppConfigStore } from '@renderer/store/appConfig'
import { toast } from 'sonner'
import FetchModelsDrawer from './FetchModelsDrawer'
import { v4 as uuidv4 } from 'uuid'
import { Badge } from "../ui/badge"
import { ProviderModelsList } from './ProviderModelsList'
import ProviderConfigurations from './ProviderConfigurations'
import ProviderListSidebar from './ProviderListSidebar'

interface ProvidersManagerProps { }

const normalizeProviderId = (name: string): string => {
    return name.trim().toLowerCase().replace(/\s+/g, '-')
}

const ProvidersManager: React.FC<ProvidersManagerProps> = () => {
    const {
        providerDefinitions,
        setProviderDefinitions,
        setAccounts,
        accounts,
        currentAccountId,
        setCurrentAccountId,
        addProviderWithAccount,
        updateAccount,
        removeAccount,
    } = useAppConfigStore()

    const visibleProviderDefinitions = useMemo(() => providerDefinitions, [providerDefinitions])

    const [selectedProviderId, setSelectedProviderId] = useState<string | undefined>(undefined)
    const [currentAccount, setCurrentAccount] = useState<ProviderAccount | undefined>(undefined)

    const [newDefinitionDisplayName, setNewDefinitionDisplayName] = useState<string>('')
    const [newDefinitionAdapterType, setNewDefinitionAdapterType] = useState<string>('openai')
    const [newProviderApi, setNewProviderApi] = useState<string>('')
    const [newProviderApiKey, setNewProviderApiKey] = useState<string>('')

    const [showFetchModelsDrawer, setShowFetchModelsDrawer] = useState<boolean>(false)
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
        } else {
            setCurrentAccount(undefined)
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


    const onAddProviderBtnClick = async (e: React.MouseEvent) => {
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

        const newAccount: ProviderAccount = {
            id: uuidv4(),
            providerId,
            label: `${displayName} Account`,
            apiUrl: baseUrl,
            apiKey,
            models: []
        }

        await addProviderWithAccount(newDefinition, newAccount)
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

    const updateCurrentAccount = (updates: Partial<ProviderAccount>) => {
        if (!selectedProviderId) return
        const account = currentAccount ?? ensureAccountForProvider(selectedProviderId)
        const nextAccount = { ...account, ...updates }
        setCurrentAccount(nextAccount)
        updateAccount(account.id, updates)
    }

    const updateProviderDefinition = (providerId: string, updates: Partial<ProviderDefinition>) => {
        const nextDefinitions = providerDefinitions.map(def => {
            if (def.id !== providerId) return def
            return { ...def, ...updates }
        })
        setProviderDefinitions(nextDefinitions)
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

    const currentDefinition = visibleProviderDefinitions.find(def => def.id === currentAccount?.providerId)
    const selectedDefinition = visibleProviderDefinitions.find(def => def.id === selectedProviderId)
    const defaultApiUrl = selectedDefinition?.defaultApiUrl || ''

    return (
        <div className='w-[700px] h-[600px] focus:ring-0 focus-visible:ring-0'>
            <div className='flex h-full bg-gray-50 dark:bg-gray-900 p-2 rounded-md gap-2'>
                <ProviderListSidebar
                    providers={visibleProviderDefinitions}
                    selectedProviderId={selectedProviderId}
                    onSelectProvider={onProviderCardClick}
                    onDeleteProvider={onProviderDeleteClick}
                    addProvider={{
                        displayName: newDefinitionDisplayName,
                        adapterType: newDefinitionAdapterType,
                        apiUrl: newProviderApi,
                        apiKey: newProviderApiKey,
                        showApiKey: showNewApiKey,
                        onDisplayNameChange: setNewDefinitionDisplayName,
                        onAdapterTypeChange: setNewDefinitionAdapterType,
                        onApiUrlChange: setNewProviderApi,
                        onApiKeyChange: setNewProviderApiKey,
                        onToggleShowApiKey: () => setShowNewApiKey(!showNewApiKey),
                        onSave: onAddProviderBtnClick
                    }}
                />
                {/* Provider Details */}
                <div id="providerDetails" className='w-3/4 flex flex-col h-full gap-3 px-2 pt-2'>
                    {!selectedDefinition ? (
                        <div className='flex-1 flex items-center justify-center text-sm text-gray-500 dark:text-gray-400'>
                            No providers available.
                        </div>
                    ) : (
                        <>
                            <ProviderConfigurations
                                providerDefinition={selectedDefinition}
                                account={currentAccount}
                                defaultApiUrl={defaultApiUrl}
                                onUpdateAccount={updateCurrentAccount}
                                onUpdateProviderDefinition={updateProviderDefinition}
                                onResetAccount={() => {
                                    if (!currentAccount) return
                                    onAccountDeleteClick(undefined as any, currentAccount)
                                }}
                            />
                            {/* Models List */}
                            <ProviderModelsList
                                selectedProviderId={selectedProviderId}
                                currentAccount={currentAccount}
                                onModelTableCellClick={onModelTableCellClick}
                                onOpenFetchModels={() => setShowFetchModelsDrawer(true)}
                                isFetchDisabled={!currentAccount?.apiKey}
                                ensureAccountForProvider={ensureAccountForProvider}
                            />
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
            />
        </div>
    )
}

export default ProvidersManager

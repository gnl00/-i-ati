import { Badge } from '@renderer/components/ui/badge'
import { Button } from "@renderer/components/ui/button"
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
} from "@renderer/components/ui/drawer"
import { Input } from '@renderer/components/ui/input'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@renderer/components/ui/table"
import { cn } from '@renderer/lib/utils'
import { Check, Download, Loader2, RefreshCw, Search, X } from 'lucide-react'
import React, { useState } from 'react'
import { toast } from 'sonner'

// API 响应类型
interface ApiModelItem {
    id: string
    object: string
    owned_by: string
    permission?: any[]
}

interface ApiModelsResponse {
    data: ApiModelItem[]
    object: 'list'
}

// 缓存数据结构
interface CachedModels {
    models: AccountModel[]
    timestamp: number
    accountId: string
}

interface FetchModelsDrawerProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    currentAccount: ProviderAccount | undefined
    providerDefinition?: ProviderDefinition
    addModel: (accountId: string, model: AccountModel) => void
}

const CACHE_TTL = 60 * 1000 // 1 分钟缓存过期时间

const FetchModelsDrawer: React.FC<FetchModelsDrawerProps> = ({
    open,
    onOpenChange,
    currentAccount,
    providerDefinition,
    addModel
}) => {
    const [isFetching, setIsFetching] = useState<boolean>(false)
    const [fetchedModels, setFetchedModels] = useState<AccountModel[]>([])
    const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(new Set())
    const [searchQuery, setSearchQuery] = useState<string>('')

    // 为每个 provider 缓存模型数据
    const [modelsCache, setModelsCache] = useState<Map<string, CachedModels>>(new Map())

    // 工具函数
    const inferModelType = (modelId: string): 'llm' | 'vlm' | 't2i' => {
        const id = modelId.toLowerCase()

        // 图像生成模型
        if (id.includes('dall-e') || id.includes('stable-diffusion') ||
            id.includes('imagen') || id.includes('midjourney')) {
            return 't2i'
        }

        // 视觉语言模型
        if (id.includes('vision')) {
            return 'vlm'
        }

        // 默认大语言模型
        return 'llm'
    }

    const transformApiModelsToAccountModels = (
        response: ApiModelsResponse
    ): AccountModel[] => {
        return response.data.map(apiModel => ({
            id: apiModel.id,
            label: apiModel.id,
            type: inferModelType(apiModel.id),
            enabled: true
        }))
    }

    const fetchModelsFromProvider = async (account: ProviderAccount): Promise<AccountModel[]> => {
        let baseUrl = account.apiUrl.replace(/\/$/, '')
        let endpoint = ''

        // Heuristic: If baseUrl ends with /v1, just append /models
        // Otherwise append /v1/models (standard for OpenAI, Anthropic, etc.)
        if (baseUrl.endsWith('/v1')) {
            endpoint = `${baseUrl}/models`
        } else {
            endpoint = `${baseUrl}/v1/models`
        }

        const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${account.apiKey}`,
                'Content-Type': 'application/json',
            },
            signal: AbortSignal.timeout(30000),
        })

        if (!response.ok) {
            const error = await response.json().catch(() => ({}))
            throw new Error(`API Error: ${response.status} - ${error.message || response.statusText}`)
        }

        const data: ApiModelsResponse = await response.json()
        return transformApiModelsToAccountModels(data)
    }

    // 事件处理函数
    const getFilteredModels = (): AccountModel[] => {
        if (!searchQuery.trim()) {
            return fetchedModels
        }

        const query = searchQuery.toLowerCase()
        return fetchedModels.filter(model =>
            model.label.toLowerCase().includes(query) ||
            model.id.toLowerCase().includes(query)
        )
    }

    const handleModelToggle = (modelId: string) => {
        const newSelected = new Set(selectedModelIds)
        if (newSelected.has(modelId)) {
            newSelected.delete(modelId)
        } else {
            newSelected.add(modelId)
        }
        setSelectedModelIds(newSelected)
    }

    const handleSelectAll = () => {
        const filteredIds = getFilteredModels().map(m => m.id)
        const currentAccountIds = new Set(currentAccount?.models.map(m => m.id) || [])
        // Only select ones that aren't already added
        const selectableIds = filteredIds.filter(id => !currentAccountIds.has(id))

        setSelectedModelIds(new Set(selectableIds))
    }

    const handleDeselectAll = () => {
        setSelectedModelIds(new Set())
    }

    const handleImportSelected = () => {
        if (!currentAccount || selectedModelIds.size === 0) {
            return
        }

        const existingIds = new Set(currentAccount.models.map(m => m.id))
        const modelsToAdd = fetchedModels.filter(m =>
            selectedModelIds.has(m.id) && !existingIds.has(m.id)
        )
        const skippedCount = selectedModelIds.size - modelsToAdd.length

        modelsToAdd.forEach(model => {
            addModel(currentAccount.id, model)
        })

        onOpenChange(false)

        if (modelsToAdd.length > 0) {
            toast.success(`Added ${modelsToAdd.length} new model(s)`)
        }
        if (skippedCount > 0) {
            toast.info(`Skipped ${skippedCount} duplicate(s)`)
        }
    }

    const handleFetch = async () => {
        if (!currentAccount) {
            toast.error('Please select an account first')
            return
        }

        if (!currentAccount.apiKey) {
            toast.error('API Key is required to fetch models')
            return
        }

        setIsFetching(true)
        try {
            const models = await fetchModelsFromProvider(currentAccount)

            if (models.length === 0) {
                toast.warning('No models found for this provider')
            }

            setFetchedModels(models)
            setSelectedModelIds(new Set())
            setSearchQuery('')

            // 更新缓存
            setModelsCache(prev => {
                const newCache = new Map(prev)
                newCache.set(currentAccount.id, {
                    models,
                    timestamp: Date.now(),
                    accountId: currentAccount.id
                })
                return newCache
            })

            toast.success(`Fetched ${models.length} model(s)`)
        } catch (error: any) {
            console.error('Failed to fetch models:', error)

            if (error.name === 'AbortError') {
                toast.error('Request timeout (30s)')
            } else if (error.message.includes('401') || error.message.includes('403')) {
                toast.error('Authentication failed - check your API key')
            } else {
                toast.error(`Failed to fetch models: ${error.message}`)
            }
        } finally {
            setIsFetching(false)
        }
    }

    // 检查缓存是否有效
    const isCacheValid = (accountId: string): boolean => {
        const cached = modelsCache.get(accountId)
        if (!cached) return false

        const now = Date.now()
        return (now - cached.timestamp) <= CACHE_TTL
    }

    // 当 Drawer 打开时，检查缓存或重新获取
    React.useEffect(() => {
        if (open && currentAccount?.apiKey) {
            const cached = modelsCache.get(currentAccount.id)

            if (cached && isCacheValid(currentAccount.id)) {
                // 使用缓存数据
                setFetchedModels(cached.models)
                setSelectedModelIds(new Set())
                setSearchQuery('')
            } else {
                // 缓存不存在或已过期，重新获取
                handleFetch()
            }
        }
    }, [open, currentAccount?.id, currentAccount?.apiKey])

    return (
        <Drawer open={open} onOpenChange={onOpenChange}>
            <DrawerContent className="max-h-[80vh] flex flex-col">
                <DrawerHeader className="border-b shrink-0 flex flex-row items-center justify-between space-y-0 pb-4">
                    <div className="space-y-1.5">
                        <DrawerTitle className="flex items-center gap-2 text-xl">
                            Import Models
                            {currentAccount && (
                                <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                                    {providerDefinition
                                        ? `${providerDefinition.displayName} · ${currentAccount.label}`
                                        : currentAccount.label}
                                </Badge>
                            )}
                        </DrawerTitle>
                        <DrawerDescription>
                            Fetch and import available models from your provider directly.
                        </DrawerDescription>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleFetch}
                        disabled={isFetching}
                        className={cn("h-8 w-8", isFetching && "animate-spin")}
                        title="Refresh models"
                    >
                        {isFetching ? <Loader2 className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
                    </Button>
                </DrawerHeader>

                {/* 搜索和操作栏 */}
                <div className="px-6 py-3 border-b bg-muted/30 shrink-0 flex items-center gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search models..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 h-9 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-0 transition-all"
                            disabled={isFetching}
                        />
                        {searchQuery && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 hover:bg-transparent text-muted-foreground hover:text-foreground"
                                onClick={() => setSearchQuery('')}
                            >
                                <X className="h-3 w-3" />
                            </Button>
                        )}
                    </div>
                    <div className="flex items-center gap-1 border-l pl-3 h-6">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleSelectAll}
                            disabled={getFilteredModels().length === 0 || isFetching}
                            className="h-8 text-xs px-2"
                        >
                            Select All
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleDeselectAll}
                            disabled={selectedModelIds.size === 0 || isFetching}
                            className="h-8 text-xs px-2"
                        >
                            Clear
                        </Button>
                    </div>
                </div>

                {/* 模型列表 */}
                <div className="flex-1 overflow-y-auto min-h-[300px] px-6">
                    {isFetching ? (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
                            <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
                            <p className="text-sm font-medium animate-pulse">Fetching models from provider...</p>
                        </div>
                    ) : getFilteredModels().length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                            <Search className="h-10 w-10 text-muted-foreground/30" />
                            <p className="text-sm font-medium">
                                {searchQuery ? 'No models match your search' : 'No models available'}
                            </p>
                            {searchQuery && (
                                <Button
                                    variant="link"
                                    size="sm"
                                    onClick={() => setSearchQuery('')}
                                    className="text-primary"
                                >
                                    Clear filters
                                </Button>
                            )}
                        </div>
                    ) : (
                        <Table>
                            <TableHeader className="sticky top-0 bg-background shadow-sm z-10">
                                <TableRow className="hover:bg-transparent border-b">
                                    <TableHead className="w-[50px] pl-6">
                                        <input
                                            type="checkbox"
                                            checked={selectedModelIds.size > 0 && selectedModelIds.size === getFilteredModels().filter(m => !currentAccount?.models.some(em => em.id === m.id)).length}
                                            onChange={(e) => e.target.checked ? handleSelectAll() : handleDeselectAll()}
                                            className="translate-y-0.5 w-4 h-4 rounded border-primary text-primary focus:ring-offset-0 focus:ring-1 focus:ring-primary/50 cursor-pointer disabled:opacity-50"
                                            disabled={getFilteredModels().every(m => currentAccount?.models.some(em => em.id === m.id))}
                                        />
                                    </TableHead>
                                    <TableHead className="w-[40%]">Model ID</TableHead>
                                    <TableHead className="w-[20%]">Type</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {getFilteredModels().map((model, idx) => {
                                    const isSelected = selectedModelIds.has(model.id)
                                    const isExisting = currentAccount?.models.some(m => m.id === model.id)

                                    return (
                                        <TableRow
                                            key={idx}
                                            className={cn(
                                                "cursor-pointer transition-colors",
                                                isSelected ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/50",
                                                isExisting && "bg-muted/30 opacity-70 hover:bg-muted/30 cursor-default"
                                            )}
                                            onClick={() => !isExisting && handleModelToggle(model.id)}
                                        >
                                            <TableCell className="pl-6">
                                                {isExisting ? (
                                                    <Check className="h-4 w-4 text-muted-foreground/50" />
                                                ) : (
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => handleModelToggle(model.id)}
                                                        className="translate-y-0.5 w-4 h-4 rounded border-gray-300 text-primary focus:ring-offset-0 focus:ring-1 focus:ring-primary/50 cursor-pointer"
                                                        onClick={(e) => e.stopPropagation()}
                                                    />
                                                )}
                                            </TableCell>
                                            <TableCell className="font-mono text-sm font-medium">
                                                {model.id}
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant="secondary"
                                                    className={cn(
                                                        "text-[10px] px-2 py-0 h-5 font-mono",
                                                        model.type === 't2i' && "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
                                                        model.type === 'vlm' && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
                                                        model.type === 'llm' && "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                                                    )}
                                                >
                                                    {model.type.toUpperCase()}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {isExisting ? (
                                                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                                                        <Check className="w-3 h-3" />
                                                        Added
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                                                        Available
                                                    </span>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    )}
                </div>

                {/* Footer */}
                <DrawerFooter className="border-t bg-muted/10 shrink-0">
                    <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            {selectedModelIds.size > 0 ? (
                                <span className="text-primary font-medium">{selectedModelIds.size} selected</span>
                            ) : (
                                <span>No models selected</span>
                            )}
                        </div>
                        <div className="flex gap-3">
                            <DrawerClose asChild>
                                <Button
                                    variant="outline"
                                    disabled={isFetching}
                                    className="w-24 rounded-3xl"
                                >
                                    Cancel
                                </Button>
                            </DrawerClose>
                            <Button
                                onClick={handleImportSelected}
                                disabled={selectedModelIds.size === 0 || isFetching}
                                className="w-32 gap-2 rounded-3xl"
                            >
                                <Download className="h-4 w-4" />
                                Import
                            </Button>
                        </div>
                    </div>
                </DrawerFooter>
            </DrawerContent>
        </Drawer>
    )
}

export default FetchModelsDrawer

import { Badge } from '@renderer/components/ui/badge'
import { Button } from "@renderer/components/ui/button"
import { Checkbox } from '@renderer/components/ui/checkbox'
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
import { useAppConfigStore } from '@renderer/store/appConfig'

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
}

const CACHE_TTL = 60 * 1000 // 1 分钟缓存过期时间
const FETCH_PENDING_ROWS = Array.from({ length: 8 }, (_, index) => index)
const MODEL_TABLE_CLASSNAME = 'table-fixed'
const MODEL_SELECTION_COLUMN_CLASSNAME = 'w-[50px] min-w-[50px] max-w-[50px] pl-6'
const MODEL_TYPE_COLUMN_CLASSNAME = 'w-[100px] min-w-[100px] max-w-[100px]'
const MODEL_STATUS_COLUMN_CLASSNAME = 'w-[120px] min-w-[120px] max-w-[120px]'
const MODEL_HEADER_CELL_CLASSNAME = 'text-[11px] font-medium text-slate-500 dark:text-slate-500 tracking-wider uppercase'
const MODEL_SELECTION_CHECKBOX_CLASSNAME = cn(
    'h-3.5 w-3.5 rounded-[4px] border bg-white shadow-xs transition-colors duration-150',
    'border-slate-300 text-emerald-700 hover:border-slate-400',
    'focus-visible:ring-2 focus-visible:ring-slate-400/40 focus-visible:ring-offset-0',
    'disabled:cursor-not-allowed disabled:opacity-40',
    'dark:border-slate-700 dark:bg-slate-950 dark:text-emerald-200 dark:hover:border-slate-500 dark:focus-visible:ring-slate-500/40',
    'data-[state=checked]:border-emerald-500/45 data-[state=checked]:bg-emerald-50 data-[state=checked]:text-emerald-700',
    'dark:data-[state=checked]:border-emerald-300/35 dark:data-[state=checked]:bg-emerald-400/10 dark:data-[state=checked]:text-emerald-200',
    '[&>span>svg]:h-3 [&>span>svg]:w-3'
)

const FetchModelsDrawer: React.FC<FetchModelsDrawerProps> = ({
    open,
    onOpenChange,
    currentAccount,
    providerDefinition
}) => {
    const { addModel } = useAppConfigStore()
    const [isFetching, setIsFetching] = useState<boolean>(false)
    const [fetchedModels, setFetchedModels] = useState<AccountModel[]>([])
    const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(new Set())
    const [searchQuery, setSearchQuery] = useState<string>('')

    // 分页状态
    const [displayedCount, setDisplayedCount] = useState<number>(20)
    const PAGE_SIZE = 20

    // 为每个 provider 缓存模型数据
    const [modelsCache, setModelsCache] = useState<Map<string, CachedModels>>(new Map())
    const accountDisplayLabel = currentAccount
        ? providerDefinition
            ? `${providerDefinition.displayName} · ${currentAccount.label}`
            : currentAccount.label
        : 'selected account'

    // 工具函数
    const inferModelType = (modelId: string): ModelType => {
        const id = modelId.toLowerCase()

        // 图像生成模型
        if (id.includes('dall-e') || id.includes('stable-diffusion') ||
            id.includes('imagen') || id.includes('midjourney')) {
            return 'img_gen'
        }

        // 明确多模态模型
        if (id.includes('gpt-4o') || id.includes('omni') ||
            id.includes('gemini') || id.includes('multimodal') ||
            id.includes('mllm')) {
            return 'mllm'
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
            return fetchedModels.slice(0, displayedCount)
        }

        const query = searchQuery.toLowerCase()
        const filtered = fetchedModels.filter(model =>
            model.label.toLowerCase().includes(query) ||
            model.id.toLowerCase().includes(query)
        )
        return filtered.slice(0, displayedCount)
    }

    const loadMore = () => {
        setDisplayedCount(prev => prev + PAGE_SIZE)
    }

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const target = e.currentTarget
        const scrolledToBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 50

        if (scrolledToBottom && !isFetching) {
            const totalFiltered = searchQuery.trim()
                ? fetchedModels.filter(model =>
                    model.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    model.id.toLowerCase().includes(searchQuery.toLowerCase())
                ).length
                : fetchedModels.length

            if (displayedCount < totalFiltered) {
                loadMore()
            }
        }
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
            setDisplayedCount(PAGE_SIZE) // 重置分页

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

    // 当搜索查询改变时，重置分页
    React.useEffect(() => {
        setDisplayedCount(PAGE_SIZE)
    }, [searchQuery])

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
                setDisplayedCount(PAGE_SIZE) // 重置分页
            } else {
                // 缓存不存在或已过期，重新获取
                handleFetch()
            }
        }
    }, [open, currentAccount?.id, currentAccount?.apiKey])

    const filteredModels = getFilteredModels()

    return (
        <Drawer open={open} onOpenChange={onOpenChange}>
            <DrawerContent className="h-[80vh] max-h-[80vh] flex flex-col overflow-hidden">
                {/* Technical Header */}
                <DrawerHeader className="relative border-b border-slate-200/60 dark:border-slate-800/60 shrink-0 flex flex-row items-center justify-between space-y-0 pb-4">
                    <div className="space-y-2 z-10">
                        <DrawerTitle className="flex items-center gap-3 text-xl font-bold tracking-tight">
                            {/* Corner Bracket Decoration */}
                            <span className="text-slate-400 dark:text-slate-600 text-xs font-mono">⟨⟨</span>
                            <span className="bg-linear-to-r from-slate-900 to-slate-700 dark:from-slate-100 dark:to-slate-300 bg-clip-text text-transparent">
                                IMPORT MODELS
                            </span>
                        </DrawerTitle>
                        <div className="flex items-center gap-2">
                          <DrawerDescription className="text-xs font-medium text-slate-500 dark:text-slate-400">
                            <span>
                                Fetch and import available models from your provider
                            </span>
                          </DrawerDescription>
                          {currentAccount && (
                            <Badge
                              variant="outline"
                              className="text-[10px] font-semibold px-3 py-0 bg-slate-100/80 dark:bg-slate-900/80 border-slate-300/50 dark:border-slate-700/50 text-slate-600 dark:text-slate-400 backdrop-blur-xs"
                            >
                              {accountDisplayLabel}
                            </Badge>
                          )}
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleFetch}
                        disabled={isFetching}
                        className={cn(
                            "h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xs z-10",
                            "hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-100/70 dark:hover:bg-slate-800/60",
                            "transition-all duration-200"
                        )}
                        title="Refresh models"
                    >
                        {isFetching ? (
                            <Loader2 className="h-4 w-4 animate-spin text-slate-500 dark:text-slate-400" />
                        ) : (
                            <RefreshCw className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                        )}
                    </Button>
                </DrawerHeader>

                {/* Technical Search Bar */}
                <div className="relative px-6 py-3 border-b border-slate-200/60 dark:border-slate-800/60 bg-slate-100/30 dark:bg-slate-900/20 shrink-0 flex items-center gap-3">
                    {/* Grid pattern overlay */}
                    <div className="absolute inset-0 opacity-[0.02] dark:opacity-[0.03] pointer-events-none" style={{
                        backgroundImage: 'linear-gradient(rgba(148, 163, 184, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.5) 1px, transparent 1px)',
                        backgroundSize: '20px 20px'
                    }} />

                    <div className="relative flex-1 group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-slate-500 group-focus-within:text-slate-600 dark:group-focus-within:text-slate-300 transition-colors" />
                        <Input
                            placeholder="SEARCH_QUERY :: ModelId | Label"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className={cn(
                                "pl-10 pr-10 h-9 text-xs",
                                "bg-white/70 dark:bg-slate-950/50",
                                "border-slate-300/60 dark:border-slate-700/60",
                                "text-slate-700 dark:text-slate-300",
                                "placeholder:text-slate-400 dark:placeholder:text-slate-600 placeholder:text-[10px]",
                                "focus-visible:ring-0 focus-visible:ring-offset-0",
                                "focus-visible:border-slate-500 dark:focus-visible:border-slate-400",
                                "focus-visible:shadow-[0_0_0_3px_rgba(100,116,139,0.12)] dark:focus-visible:shadow-[0_0_0_3px_rgba(148,163,184,0.14)]",
                                "transition-all duration-200"
                            )}
                            disabled={isFetching}
                        />
                        {searchQuery && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className={cn(
                                    "absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0",
                                    "hover:bg-rose-500/10 dark:hover:bg-rose-500/20",
                                    "text-slate-400 hover:text-rose-500 dark:text-slate-600 dark:hover:text-rose-400",
                                    "transition-all duration-150"
                                )}
                                onClick={() => setSearchQuery('')}
                            >
                                <X className="h-3 w-3" />
                            </Button>
                        )}
                    </div>
                    <div className="flex items-center border-l border-slate-300/60 dark:border-slate-700/60 pl-3">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleDeselectAll}
                            disabled={selectedModelIds.size === 0 || isFetching}
                            className={cn(
                                "h-7 text-[10px] px-2.5 font-semibold tracking-wide",
                                "border border-transparent",
                                "hover:border-rose-300 dark:hover:border-rose-800",
                                "hover:bg-rose-50 dark:hover:bg-rose-950/30",
                                "hover:text-rose-600 dark:hover:text-rose-400",
                                "transition-all duration-150"
                            )}
                        >
                            Clear
                        </Button>
                    </div>
                </div>

                {/* 模型列表 */}
                <div className="flex min-h-0 flex-1 min-w-0 flex-col overflow-hidden bg-white/40 dark:bg-slate-950/40">
                    {isFetching ? (
                        <div className="flex h-full min-h-0 flex-col px-6 py-4">
                            <div className="mb-3 flex h-9 items-center gap-2 rounded-lg border border-slate-200/70 bg-slate-50/75 px-3 text-[11px] font-medium text-slate-500 dark:border-slate-800/70 dark:bg-slate-900/50 dark:text-slate-400">
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400 dark:text-slate-500" />
                                <span className="truncate">Fetching models...</span>
                            </div>
                            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg">
                                <div>
                                    <Table className={MODEL_TABLE_CLASSNAME}>
                                        <TableHeader className="bg-slate-50/95 dark:bg-slate-900/95">
                                            <TableRow className="hover:bg-transparent">
                                                <TableHead className={cn(MODEL_SELECTION_COLUMN_CLASSNAME, 'text-slate-500 dark:text-slate-500 tracking-wider')}>
                                                    <div className="h-3.5 w-3.5 rounded border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900" />
                                                </TableHead>
                                                <TableHead className={MODEL_HEADER_CELL_CLASSNAME}>
                                                    Model ID
                                                </TableHead>
                                                <TableHead className={cn(MODEL_TYPE_COLUMN_CLASSNAME, MODEL_HEADER_CELL_CLASSNAME)}>
                                                    Type
                                                </TableHead>
                                                <TableHead className={cn(MODEL_STATUS_COLUMN_CLASSNAME, MODEL_HEADER_CELL_CLASSNAME)}>
                                                    Status
                                                </TableHead>
                                            </TableRow>
                                        </TableHeader>
                                    </Table>
                                </div>
                                <div className="min-h-0 flex-1 overflow-hidden">
                                    <Table className={MODEL_TABLE_CLASSNAME}>
                                        <TableBody>
                                            {FETCH_PENDING_ROWS.map((row) => (
                                                <TableRow key={row} className="border-b border-slate-100 dark:border-slate-900/50 hover:bg-transparent">
                                                    <TableCell className={MODEL_SELECTION_COLUMN_CLASSNAME}>
                                                        <div className="h-3.5 w-3.5 rounded border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900" />
                                                    </TableCell>
                                                    <TableCell>
                                                        <div
                                                            className="h-3 w-full max-w-[360px] rounded-sm bg-slate-200/70 dark:bg-slate-800/70 animate-pulse"
                                                            style={{ width: `${52 + (row % 4) * 9}%` }}
                                                        />
                                                    </TableCell>
                                                    <TableCell className={MODEL_TYPE_COLUMN_CLASSNAME}>
                                                        <div className="h-5 w-12 rounded-md border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900 animate-pulse" />
                                                    </TableCell>
                                                    <TableCell className={MODEL_STATUS_COLUMN_CLASSNAME}>
                                                        <div className="h-3 w-16 rounded-sm bg-slate-200/70 dark:bg-slate-800/70 animate-pulse" />
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        </div>
                    ) : filteredModels.length === 0 ? (
                        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-muted-foreground">
                            <div className="relative">
                                <Search className="h-12 w-12 text-slate-300 dark:text-slate-700" />
                                <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                                    <X className="h-2.5 w-2.5 text-slate-400 dark:text-slate-600" />
                                </div>
                            </div>
                            <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                                {searchQuery ? '[ NO MATCH FOUND ]' : '[ NO MODELS AVAILABLE ]'}
                            </p>
                            {searchQuery && (
                                <Button
                                    variant="link"
                                    size="sm"
                                    onClick={() => setSearchQuery('')}
                                    className="text-rose-600 dark:text-rose-400 text-xs hover:text-rose-700 dark:hover:text-rose-300"
                                >
                                    → Clear filters
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div className="flex min-h-0 flex-1 flex-col px-1 py-1">
                            <div className="overflow-hidden rounded-t-lg border border-b-0 border-slate-200/60 bg-slate-50/95 shadow-xs dark:border-slate-800/60 dark:bg-slate-900/95">
                                <Table className={MODEL_TABLE_CLASSNAME}>
                                    <TableHeader className="bg-slate-50/95 dark:bg-slate-900/95">
                                        <TableRow className="hover:bg-transparent">
                                            <TableHead className={cn(MODEL_SELECTION_COLUMN_CLASSNAME, 'text-[10px] text-slate-500 dark:text-slate-500 tracking-wider')}>
                                                <Checkbox
                                                    checked={selectedModelIds.size > 0 && selectedModelIds.size === filteredModels.filter(m => !currentAccount?.models.some(em => em.id === m.id)).length}
                                                    onCheckedChange={(checked) => checked === true ? handleSelectAll() : handleDeselectAll()}
                                                    className={MODEL_SELECTION_CHECKBOX_CLASSNAME}
                                                    disabled={filteredModels.every(m => currentAccount?.models.some(em => em.id === m.id))}
                                                />
                                            </TableHead>
                                            <TableHead className={MODEL_HEADER_CELL_CLASSNAME}>
                                                Model ID
                                            </TableHead>
                                            <TableHead className={cn(MODEL_TYPE_COLUMN_CLASSNAME, MODEL_HEADER_CELL_CLASSNAME)}>
                                                Type
                                            </TableHead>
                                            <TableHead className={cn(MODEL_STATUS_COLUMN_CLASSNAME, MODEL_HEADER_CELL_CLASSNAME)}>
                                                Status
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                </Table>
                            </div>
                            <div
                                className="min-h-0 flex-1 overflow-y-auto rounded-b-lg border border-slate-200/60 bg-white/40 dark:border-slate-800/60 dark:bg-slate-950/40"
                                onScroll={handleScroll}
                            >
                                <Table className={MODEL_TABLE_CLASSNAME}>
                                    <TableBody>
                                        {filteredModels.map((model, idx) => {
                                            const isSelected = selectedModelIds.has(model.id)
                                            const isExisting = currentAccount?.models.some(m => m.id === model.id)

                                            return (
                                                <TableRow
                                                    key={idx}
                                                    className={cn(
                                                        "group cursor-pointer border-b border-slate-100 dark:border-slate-900/50 transition-all duration-200",
                                                        !isExisting && "hover:bg-slate-50/50 dark:hover:bg-slate-900/30",
                                                        isExisting && "bg-slate-50/30 dark:bg-slate-900/20 opacity-60 cursor-not-allowed"
                                                    )}
                                                    onClick={() => !isExisting && handleModelToggle(model.id)}
                                                >

                                                    <TableCell className={MODEL_SELECTION_COLUMN_CLASSNAME}>
                                                        {isExisting ? (
                                                            <div className="w-4 h-4 rounded border-2 border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                                                <Check className="h-2.5 w-2.5 text-slate-400 dark:text-slate-600" />
                                                            </div>
                                                        ) : (
                                                            <Checkbox
                                                                checked={isSelected}
                                                                onCheckedChange={() => handleModelToggle(model.id)}
                                                                className={MODEL_SELECTION_CHECKBOX_CLASSNAME}
                                                                onClick={(e) => e.stopPropagation()}
                                                            />
                                                        )}
                                                    </TableCell>
                                                    <TableCell className={cn(
                                                        "text-xs font-medium transition-colors",
                                                        isSelected
                                                            ? "text-slate-800 dark:text-slate-100"
                                                            : "text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-slate-100"
                                                    )}>
                                                        {model.id}
                                                    </TableCell>
                                                    <TableCell className={MODEL_TYPE_COLUMN_CLASSNAME}>
                                                        <Badge
                                                            variant="secondary"
                                                            className={cn(
                                                                "text-[9px] px-2 py-0.5 h-5 font-bold tracking-tight",
                                                                "border transition-all duration-150",
                                                                model.type === 'img_gen' && cn(
                                                                    "bg-purple-50 dark:bg-purple-950/30",
                                                                    "text-purple-600 dark:text-purple-400",
                                                                    "border-purple-200 dark:border-purple-900/50",
                                                                    "group-hover:bg-purple-100 dark:group-hover:bg-purple-900/40",
                                                                    "group-hover:border-purple-300 dark:group-hover:border-purple-800"
                                                                ),
                                                                model.type === 'mllm' && cn(
                                                                    "bg-emerald-50 dark:bg-emerald-950/30",
                                                                    "text-emerald-600 dark:text-emerald-400",
                                                                    "border-emerald-200 dark:border-emerald-900/50",
                                                                    "group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/40",
                                                                    "group-hover:border-emerald-300 dark:group-hover:border-emerald-800"
                                                                ),
                                                                model.type === 'vlm' && cn(
                                                                    "bg-amber-50 dark:bg-amber-950/25",
                                                                    "text-amber-700 dark:text-amber-400",
                                                                    "border-amber-200 dark:border-amber-900/50",
                                                                    "group-hover:bg-amber-100 dark:group-hover:bg-amber-900/35",
                                                                    "group-hover:border-amber-300 dark:group-hover:border-amber-800"
                                                                ),
                                                                model.type === 'llm' && cn(
                                                                    "bg-slate-50 dark:bg-slate-900/50",
                                                                    "text-slate-600 dark:text-slate-400",
                                                                    "border-slate-200 dark:border-slate-800",
                                                                    "group-hover:bg-slate-100 dark:group-hover:bg-slate-800/70",
                                                                    "group-hover:border-slate-300 dark:group-hover:border-slate-700"
                                                                )
                                                            )}
                                                        >
                                                            {model.type.toUpperCase()}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className={MODEL_STATUS_COLUMN_CLASSNAME}>
                                                        {isExisting ? (
                                                            <span className="inline-flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-500 font-semibold tracking-tight">
                                                                <Check className="w-3 h-3" />
                                                                ADDED
                                                            </span>
                                                        ) : isSelected ? (
                                                            <span className="inline-flex items-center gap-1.5 text-[10px] text-emerald-700/90 dark:text-emerald-300/90 font-semibold tracking-tight">
                                                                SELECTED
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-500 font-semibold tracking-tight">
                                                                AVAILABLE
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        })}
                                    </TableBody>
                                </Table>

                                {/* 加载提示 */}
                                {(() => {
                                    const totalFiltered = searchQuery.trim()
                                        ? fetchedModels.filter(model =>
                                            model.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                            model.id.toLowerCase().includes(searchQuery.toLowerCase())
                                        ).length
                                        : fetchedModels.length

                                    const hasMore = displayedCount < totalFiltered

                                    return (
                                        <div className="py-5 text-center">
                                            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100/80 dark:bg-slate-900/80 border border-slate-200/60 dark:border-slate-800/60">
                                                <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 tracking-wide">
                                                    {hasMore ? (
                                                        <>
                                                            <span className="text-slate-700 dark:text-slate-300">{displayedCount}</span>
                                                            {' / '}
                                                            <span>{totalFiltered}</span>
                                                            {' '}
                                                            LOADED · SCROLL FOR MORE
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                                                            {' '}
                                                            ALL {totalFiltered} MODELS LOADED
                                                        </>
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                    )
                                })()}
                            </div>
                        </div>
                    )}
                </div>

                {/* Technical Footer */}
                <DrawerFooter className="relative border-t border-slate-200/60 dark:border-slate-800/60 bg-slate-100/30 dark:bg-slate-900/20 shrink-0 overflow-hidden">
                    {/* Corner decoration */}
                    <div className="absolute bottom-0 left-0 w-24 h-full bg-linear-to-tr from-slate-500/5 to-transparent pointer-events-none" />

                    <div className="flex items-center justify-between w-full z-10">
                        <div className="flex items-center gap-3">
                            {selectedModelIds.size > 0 ? (
                                <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 tracking-tight">
                                        [ {selectedModelIds.size} SELECTED ]
                                    </span>
                                </div>
                            ) : (
                                <span className="text-xs text-slate-500 dark:text-slate-500 tracking-tight">
                                    [ NO SELECTION ]
                                </span>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <DrawerClose asChild>
                                <Button
                                    variant="ghost"
                                    disabled={isFetching}
                                    className={cn(
                                        "h-9 px-6 text-xs tracking-wide rounded-xl text-rose-400 dark:text-rose-400 hover:text-rose-500 dark:hover:text-rose-300",
                                        "border-slate-300 dark:border-slate-700",
                                        "hover:bg-slate-200/50 dark:hover:bg-slate-800/50",
                                        "transition-all duration-150"
                                    )}
                                >
                                    CANCEL
                                </Button>
                            </DrawerClose>
                            <Button
                                onClick={handleImportSelected}
                                disabled={selectedModelIds.size === 0 || isFetching}
                                className={cn(
                                    "h-9 px-6 gap-2 text-xs rounded-xl font-semibold tracking-wide",
                                    "bg-slate-900 dark:bg-slate-100",
                                    "hover:bg-slate-800 dark:hover:bg-slate-200",
                                    "text-white dark:text-slate-950",
                                    "shadow-md shadow-slate-900/10 dark:shadow-black/20",
                                    "border border-slate-950/40 dark:border-slate-200/60",
                                    "transition-all duration-150",
                                    "hover:shadow-lg hover:shadow-slate-900/15 dark:hover:shadow-black/25",
                                    "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                                )}
                            >
                                <Download className="h-3.5 w-3.5" />
                                IMPORT
                            </Button>
                        </div>
                    </div>
                </DrawerFooter>
            </DrawerContent>
        </Drawer>
    )
}

export default FetchModelsDrawer

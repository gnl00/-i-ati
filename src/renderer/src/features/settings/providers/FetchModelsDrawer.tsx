import { Badge } from '@renderer/shared/components/ui/badge'
import { Button } from "@renderer/shared/components/ui/button"
import { Checkbox } from '@renderer/shared/components/ui/checkbox'
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerFooter,
} from "@renderer/shared/components/ui/drawer"
import DrawerHeaderBar from "@renderer/shared/components/ui/DrawerHeaderBar"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@renderer/shared/components/ui/table"
import { cn } from '@renderer/shared/lib/utils'
import { Check, Download, Loader2, RefreshCw, Search, X } from 'lucide-react'
import React, { useState } from 'react'
import { toast } from 'sonner'
import { invokeProviderFetchModels } from '@renderer/infrastructure/ipc'
import { useAppConfigStore } from '@renderer/infrastructure/config/appConfig'
import ExpandableSearchInput from '../common/ExpandableSearchInput'
import {
    settingsOutlineButtonClassName,
    settingsPrimaryButtonClassName,
    settingsSecondaryButtonClassName
} from '../common/SettingsLayout'
import {
    buildFetchModelsCacheKey,
    type FetchModelsTarget
} from './FetchModelsDrawer.cacheKey'

export type { FetchModelsTarget } from './FetchModelsDrawer.cacheKey'

// 缓存数据结构
interface CachedModels {
    models: AccountModel[]
    timestamp: number
    cacheKey: string
}

interface FetchModelsDrawerProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    target: FetchModelsTarget | undefined
}

const CACHE_TTL = 60 * 1000 // 1 分钟缓存过期时间
const PAGE_SIZE = 20
const FETCH_PENDING_ROWS = Array.from({ length: 8 }, (_, index) => index)
const MODEL_TABLE_CLASSNAME = 'table-fixed'
const MODEL_SELECTION_COLUMN_CLASSNAME = 'w-[46px] min-w-[46px] max-w-[46px] pl-5'
const MODEL_TYPE_COLUMN_CLASSNAME = 'w-[100px] min-w-[100px] max-w-[100px]'
const MODEL_STATUS_COLUMN_CLASSNAME = 'w-[120px] min-w-[120px] max-w-[120px]'
const MODEL_HEADER_CELL_CLASSNAME = 'text-[11px] font-medium text-gray-500 dark:text-gray-400'
const MODEL_TYPE_BADGE_CLASSNAME = 'text-[9.5px] font-medium uppercase px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-0'
const MODEL_SELECTION_CHECKBOX_CLASSNAME = cn(
    'h-3.5 w-3.5 rounded-[4px] border bg-white shadow-xs transition-colors duration-150',
    'border-gray-300 text-gray-800 hover:border-gray-400',
    'focus-visible:ring-2 focus-visible:ring-gray-400/40 focus-visible:ring-offset-0',
    'disabled:cursor-not-allowed disabled:opacity-40',
    'dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:hover:border-gray-500 dark:focus-visible:ring-gray-500/40',
    'data-[state=checked]:border-gray-800 data-[state=checked]:bg-gray-800 data-[state=checked]:text-white',
    'dark:data-[state=checked]:border-gray-200 dark:data-[state=checked]:bg-gray-200 dark:data-[state=checked]:text-gray-900',
    '[&>span>svg]:h-3 [&>span>svg]:w-3'
)

const FetchModelsDrawer: React.FC<FetchModelsDrawerProps> = ({
    open,
    onOpenChange,
    target
}) => {
    const { addModel } = useAppConfigStore()
    const [isFetching, setIsFetching] = useState<boolean>(false)
    const [fetchedModels, setFetchedModels] = useState<AccountModel[]>([])
    const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(new Set())
    const [searchQuery, setSearchQuery] = useState<string>('')

    // 分页状态
    const [displayedCount, setDisplayedCount] = useState<number>(PAGE_SIZE)

    // 为每个 provider 缓存模型数据
    const [modelsCache, setModelsCache] = useState<Map<string, CachedModels>>(new Map())
    const activeAccount = target?.account
    const activeProviderDefinition = target?.providerDefinition
    const activeCacheKey = target ? buildFetchModelsCacheKey(target) : undefined
    const activeCacheKeyRef = React.useRef<string | undefined>(undefined)
    activeCacheKeyRef.current = activeCacheKey
    const accountDisplayLabel = activeAccount
        ? activeProviderDefinition
            ? `${activeProviderDefinition.displayName} · ${activeAccount.label}`
            : activeAccount.label
        : 'selected account'

    const resetFetchedModelState = React.useCallback(() => {
        setFetchedModels([])
        setSelectedModelIds(new Set())
        setSearchQuery('')
        setDisplayedCount(PAGE_SIZE)
    }, [])

    const fetchModelsFromProvider = async (account: ProviderAccount): Promise<AccountModel[]> => {
        const response = await invokeProviderFetchModels({
            account
        })

        if (response.ok) {
            return response.models
        }

        throw Object.assign(new Error(response.error), {
            status: response.status
        })
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
        const currentAccountIds = new Set(activeAccount?.models.map(m => m.id) || [])
        // Only select ones that aren't already added
        const selectableIds = filteredIds.filter(id => !currentAccountIds.has(id))

        setSelectedModelIds(new Set(selectableIds))
    }

    const handleDeselectAll = () => {
        setSelectedModelIds(new Set())
    }

    const handleImportSelected = () => {
        if (!activeAccount || selectedModelIds.size === 0) {
            return
        }

        const latestAccount = useAppConfigStore.getState().getAccountById(activeAccount.id)
        if (!latestAccount) {
            toast.error('Selected account is unavailable')
            return
        }

        const existingIds = new Set(latestAccount.models.map(m => m.id))
        const modelsToAdd = fetchedModels.filter(m =>
            selectedModelIds.has(m.id) && !existingIds.has(m.id)
        )
        const skippedCount = selectedModelIds.size - modelsToAdd.length

        modelsToAdd.forEach(model => {
            addModel(activeAccount.id, model)
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
        const requestTarget = target
        const requestCacheKey = requestTarget ? buildFetchModelsCacheKey(requestTarget) : undefined

        if (!requestTarget || !requestCacheKey) {
            toast.error('Please select an account first')
            return
        }

        if (!requestTarget.account.apiKey) {
            toast.error('API Key is required to fetch models')
            return
        }

        setIsFetching(true)
        try {
            const models = await fetchModelsFromProvider(requestTarget.account)

            if (activeCacheKeyRef.current !== requestCacheKey) {
                return
            }

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
                newCache.set(requestCacheKey, {
                    models,
                    timestamp: Date.now(),
                    cacheKey: requestCacheKey
                })
                return newCache
            })

            toast.success(`Fetched ${models.length} model(s)`)
        } catch (error: any) {
            if (activeCacheKeyRef.current !== requestCacheKey) {
                return
            }

            console.error('Failed to fetch models:', error)

            if (error.status === 401 || error.status === 403) {
                toast.error('Authentication failed - check your API key')
            } else if (error.message === 'Request timeout (30s)') {
                toast.error('Request timeout (30s)')
            } else if (error.message.includes('401') || error.message.includes('403')) {
                toast.error('Authentication failed - check your API key')
            } else {
                toast.error(`Failed to fetch models: ${error.message}`)
            }
        } finally {
            if (activeCacheKeyRef.current === requestCacheKey) {
                setIsFetching(false)
            }
        }
    }

    // 当搜索查询改变时，重置分页
    React.useEffect(() => {
        setDisplayedCount(PAGE_SIZE)
    }, [searchQuery])

    // 检查缓存是否有效
    const isCacheValid = (cacheKey: string): boolean => {
        const cached = modelsCache.get(cacheKey)
        if (!cached) return false

        const now = Date.now()
        return (now - cached.timestamp) <= CACHE_TTL
    }

    // 当 Drawer 打开时，检查缓存或重新获取
    React.useEffect(() => {
        if (!open) {
            setIsFetching(false)
            return
        }

        if (!target?.account.apiKey || !activeCacheKey) {
            resetFetchedModelState()
            return
        }

        const cached = modelsCache.get(activeCacheKey)

        if (cached && isCacheValid(activeCacheKey)) {
            // 使用缓存数据
            setFetchedModels(cached.models)
            setSelectedModelIds(new Set())
            setSearchQuery('')
            setDisplayedCount(PAGE_SIZE) // 重置分页
            return
        }

        // 缓存不存在或已过期，重新获取
        resetFetchedModelState()
        handleFetch()
    }, [open, activeCacheKey, target?.account.apiKey])

    const filteredModels = getFilteredModels()

    return (
        <Drawer open={open} onOpenChange={onOpenChange}>
            <DrawerContent className="h-[80vh] max-h-[80vh] flex flex-col overflow-hidden">
                {/* Header */}
                <DrawerHeaderBar
                    className="shrink-0"
                    icon={<Download className="h-4 w-4" />}
                    title="Import models"
                    description="Choose models available from this account."
                    context={activeAccount ? accountDisplayLabel : undefined}
                />

                {/* Model Search Bar */}
                <div className="shrink-0 border-b border-gray-200/60 bg-gray-50/70 px-5 py-3 dark:border-gray-800/60 dark:bg-gray-950/30">
                    <div className="flex min-w-0 items-center gap-3">
                        <ExpandableSearchInput
                            value={searchQuery}
                            onChange={setSearchQuery}
                            placeholder="Search models"
                            disabled={isFetching}
                            expandable={false}
                            showClear
                            className="h-9 min-w-0 flex-1"
                        />
                        <div className="flex shrink-0 items-center gap-2 border-l border-gray-200/70 pl-3 dark:border-gray-800/70">
                            <Button
                                variant="ghost"
                                onClick={handleFetch}
                                disabled={isFetching || !activeAccount}
                                className={cn(settingsOutlineButtonClassName, 'group')}
                                aria-label="Refresh models"
                                title="Refresh models"
                            >
                                <RefreshCw
                                    className={cn(
                                        'h-3.5 w-3.5 text-gray-500 dark:text-gray-400 transition-transform duration-500 ease-out',
                                        isFetching ? 'animate-spin' : 'group-hover:rotate-180'
                                    )}
                                />
                                <span>{isFetching ? 'Refreshing…' : 'Refresh'}</span>
                            </Button>
                            <Button
                                variant="ghost"
                                onClick={handleDeselectAll}
                                disabled={selectedModelIds.size === 0 || isFetching}
                                aria-label="Clear selected models"
                                title="Clear selected models"
                                className={settingsSecondaryButtonClassName}
                            >
                                Clear
                            </Button>
                        </div>
                    </div>
                </div>

                {/* 模型列表 */}
                <div className="flex min-h-0 flex-1 min-w-0 flex-col overflow-hidden bg-white/40 dark:bg-gray-950/40">
                    {isFetching ? (
                        <div className="flex h-full min-h-0 flex-col">
                            <div className="flex h-9 items-center gap-2 border-b border-gray-200/60 bg-gray-50/70 px-5 text-[11px] font-medium text-gray-500 dark:border-gray-800/60 dark:bg-gray-950/30 dark:text-gray-400">
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400 dark:text-gray-500" />
                                <span className="truncate">Fetching models…</span>
                            </div>
                            <div className="min-h-0 flex-1 overflow-hidden">
                                <Table className={MODEL_TABLE_CLASSNAME}>
                                    <TableBody>
                                        {FETCH_PENDING_ROWS.map((row) => (
                                            <TableRow key={row} className="border-b border-gray-100 dark:border-gray-900/50 hover:bg-transparent">
                                                <TableCell className={MODEL_SELECTION_COLUMN_CLASSNAME}>
                                                    <div className="h-3.5 w-3.5 rounded border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-900" />
                                                </TableCell>
                                                <TableCell>
                                                    <div
                                                        className="h-3 w-full max-w-[360px] rounded-sm bg-gray-200/70 dark:bg-gray-800/70 animate-pulse"
                                                        style={{ width: `${52 + (row % 4) * 9}%` }}
                                                    />
                                                </TableCell>
                                                <TableCell className={MODEL_TYPE_COLUMN_CLASSNAME}>
                                                    <div className="h-5 w-12 rounded-md border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-900 animate-pulse" />
                                                </TableCell>
                                                <TableCell className={MODEL_STATUS_COLUMN_CLASSNAME}>
                                                    <div className="h-3 w-16 rounded-sm bg-gray-200/70 dark:bg-gray-800/70 animate-pulse" />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    ) : filteredModels.length === 0 ? (
                        <div className="flex h-full flex-col items-center justify-center gap-3 px-5 text-muted-foreground">
                            <div className="relative">
                                <Search className="h-12 w-12 text-gray-300 dark:text-gray-700" />
                                <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center">
                                    <X className="h-2.5 w-2.5 text-gray-400 dark:text-gray-600" />
                                </div>
                            </div>
                            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                                {searchQuery ? 'No matching models' : 'No models available'}
                            </p>
                            {searchQuery && (
                                <Button
                                    variant="link"
                                    size="sm"
                                    onClick={() => setSearchQuery('')}
                                    className="text-gray-500 dark:text-gray-400 text-xs hover:text-gray-700 dark:hover:text-gray-200"
                                >
                                    Clear filters
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div className="flex min-h-0 flex-1 flex-col">
                            <div className="border-b border-gray-200/60 bg-gray-50/70 dark:border-gray-800/60 dark:bg-gray-950/30">
                                <Table className={MODEL_TABLE_CLASSNAME}>
                                    <TableHeader>
                                        <TableRow className="hover:bg-transparent border-0">
                                            <TableHead className={MODEL_SELECTION_COLUMN_CLASSNAME}>
                                                <Checkbox
                                                    checked={selectedModelIds.size > 0 && selectedModelIds.size === filteredModels.filter(m => !activeAccount?.models.some(em => em.id === m.id)).length}
                                                    onCheckedChange={(checked) => checked === true ? handleSelectAll() : handleDeselectAll()}
                                                    className={MODEL_SELECTION_CHECKBOX_CLASSNAME}
                                                    disabled={filteredModels.every(m => activeAccount?.models.some(em => em.id === m.id))}
                                                />
                                            </TableHead>
                                            <TableHead className={MODEL_HEADER_CELL_CLASSNAME}>
                                                Model
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
                                className="min-h-0 flex-1 overflow-y-auto"
                                onScroll={handleScroll}
                            >
                                <Table className={MODEL_TABLE_CLASSNAME}>
                                    <TableBody>
                                        {filteredModels.map((model, idx) => {
                                            const isSelected = selectedModelIds.has(model.id)
                                            const isExisting = activeAccount?.models.some(m => m.id === model.id)

                                            return (
                                                <TableRow
                                                    key={idx}
                                                    className={cn(
                                                        "group cursor-pointer border-b border-gray-100 dark:border-gray-900/50 transition-colors duration-150",
                                                        !isExisting && "hover:bg-gray-50 dark:hover:bg-gray-900/40",
                                                        isExisting && "bg-gray-50/30 dark:bg-gray-900/20 opacity-60 cursor-not-allowed"
                                                    )}
                                                    onClick={() => !isExisting && handleModelToggle(model.id)}
                                                >

                                                    <TableCell className={MODEL_SELECTION_COLUMN_CLASSNAME}>
                                                        {isExisting ? (
                                                            <div className="w-4 h-4 rounded border-2 border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                                                                <Check className="h-2.5 w-2.5 text-gray-400 dark:text-gray-600" />
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
                                                        "text-[12.5px] font-medium truncate transition-colors",
                                                        isSelected
                                                            ? "text-gray-900 dark:text-gray-100"
                                                            : "text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100"
                                                    )}>
                                                        {model.id}
                                                    </TableCell>
                                                    <TableCell className={MODEL_TYPE_COLUMN_CLASSNAME}>
                                                        <Badge
                                                            variant="secondary"
                                                            className={MODEL_TYPE_BADGE_CLASSNAME}
                                                        >
                                                            {model.type}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className={MODEL_STATUS_COLUMN_CLASSNAME}>
                                                        {isExisting ? (
                                                            <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400 font-medium">
                                                                <Check className="w-3 h-3" />
                                                                Added
                                                            </span>
                                                        ) : isSelected ? (
                                                            <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-800 dark:text-gray-200 font-medium">
                                                                Selected
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-500 font-medium">
                                                                Available
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
                                        <div className="py-4 text-center text-[11px] text-gray-400 dark:text-gray-500">
                                            {hasMore ? (
                                                <>{displayedCount} of {totalFiltered} · scroll for more</>
                                            ) : (
                                                <>All {totalFiltered} models loaded</>
                                            )}
                                        </div>
                                    )
                                })()}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <DrawerFooter className="shrink-0 border-t border-gray-200/60 bg-gray-50/40 px-5 py-4 dark:border-gray-800/60 dark:bg-gray-900/20">
                    <div className="flex items-center justify-between w-full">
                        <span className="text-[12px] text-gray-500 dark:text-gray-400">
                            {selectedModelIds.size > 0
                                ? `${selectedModelIds.size} selected`
                                : 'No selection'}
                        </span>
                        <div className="flex gap-2">
                            <DrawerClose asChild>
                                <Button
                                    variant="ghost"
                                    disabled={isFetching}
                                    className={cn(settingsOutlineButtonClassName, 'h-9 px-5 text-[12px]')}
                                >
                                    Cancel
                                </Button>
                            </DrawerClose>
                            <Button
                                onClick={handleImportSelected}
                                disabled={selectedModelIds.size === 0 || isFetching}
                                className={cn(settingsPrimaryButtonClassName, 'h-9 px-5 gap-2 text-[12px]')}
                            >
                                <Download className="h-3.5 w-3.5" />
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

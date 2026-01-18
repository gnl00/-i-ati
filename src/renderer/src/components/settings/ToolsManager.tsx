import { Badge } from '@renderer/components/ui/badge'
import { Button } from "@renderer/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@renderer/components/ui/command'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { Switch } from "@renderer/components/ui/switch"
import { cn } from '@renderer/lib/utils'
import { exportConfigAsJSON, getConfig, importConfigFromJSON } from '@renderer/db/ConfigRepository'
import { useAppConfigStore } from '@renderer/store/appConfig'
import { Check, ChevronsUpDown } from "lucide-react"
import React, { useState } from 'react'
import { toast } from 'sonner'

interface ToolsManagerProps {
    maxWebSearchItems: number
    setMaxWebSearchItems: (value: number) => void
    memoryEnabled: boolean
    setMemoryEnabled: (value: boolean) => void
    compressionEnabled: boolean
    setCompressionEnabled: (value: boolean) => void
    compressionTriggerThreshold: number
    setCompressionTriggerThreshold: (value: number) => void
    compressionKeepRecentCount: number
    setCompressionKeepRecentCount: (value: number) => void
    compressionCompressCount: number
    setCompressionCompressCount: (value: number) => void
}

const ToolsManager: React.FC<ToolsManagerProps> = ({
    maxWebSearchItems,
    setMaxWebSearchItems,
    memoryEnabled,
    setMemoryEnabled,
    compressionEnabled,
    setCompressionEnabled,
    compressionTriggerThreshold,
    setCompressionTriggerThreshold,
    compressionKeepRecentCount,
    setCompressionKeepRecentCount,
    compressionCompressCount,
    setCompressionCompressCount
}) => {
    const {
        setAppConfig,
        accounts,
        providerDefinitions,
        resolveModelRef,
        titleGenerateModel,
        setTitleGenerateModel,
        titleGenerateEnabled,
        setTitleGenerateEnabled,
    } = useAppConfigStore()

    const [selectTitleModelPopoutState, setSelectTitleModelPopoutState] = useState(false)
    const modelOptions = React.useMemo(() => {
        return accounts.flatMap(account =>
            account.models
                .filter(model => model.enabled !== false)
                .map(model => ({
                    account,
                    model,
                    definition: providerDefinitions.find(def => def.id === account.providerId)
                }))
        )
    }, [accounts, providerDefinitions])
    const selectedTitleModel = React.useMemo(() => {
        return resolveModelRef(titleGenerateModel)
    }, [resolveModelRef, titleGenerateModel, accounts, providerDefinitions])

    const handleExportConfig = async () => {
        try {
            const jsonStr = await exportConfigAsJSON()
            const blob = new Blob([jsonStr], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `ati-config-${Date.now()}.json`
            a.click()
            URL.revokeObjectURL(url)
            toast.success('Config exported successfully')
        } catch (error) {
            console.error('Export error:', error)
            toast.error('Failed to export config')
        }
    }

    const handleImportConfig = () => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json,application/json'
        input.onchange = async (e) => {
            try {
                const file = (e.target as HTMLInputElement).files?.[0]
                if (!file) return

                const text = await file.text()
                await importConfigFromJSON(text)

                const newConfig = await getConfig()
                if (newConfig) {
                    setAppConfig(newConfig)
                    toast.success('Config imported successfully. Reloading...')
                    setTimeout(() => window.location.reload(), 1000)
                }
            } catch (error: any) {
                console.error('Import error:', error)
                toast.error('Failed to import config: ' + error.message)
            }
        }
        input.click()
    }

    return (
        <div className='w-[700px] h-[600px] focus:ring-0 focus-visible:ring-0'>
            <div className='w-full h-full space-y-2 p-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent hover:scrollbar-thumb-gray-400 dark:hover:scrollbar-thumb-gray-500'>
                {/* Title Generation Setting */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md">
                    <div className="p-5 flex items-start gap-4">
                        <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                                <Label htmlFor="toggle-title-generation" className="text-base font-medium text-gray-900 dark:text-gray-100">
                                    Title Generation
                                </Label>
                                <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
                                    AI
                                </Badge>
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                                Automatically analyze conversation context and generate concise, meaningful titles using AI models.
                            </p>
                        </div>
                        <Switch
                            checked={titleGenerateEnabled}
                            onCheckedChange={setTitleGenerateEnabled}
                            id="toggle-title-generation"
                            className="data-[state=checked]:bg-blue-600 mt-1"
                        />
                    </div>
                    {/* Model Selection Area */}
                    <div className={cn(
                        "grid transition-all duration-300 ease-in-out bg-gray-50/50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-700/50",
                        titleGenerateEnabled ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    )}>
                        <div className="overflow-hidden">
                            <div className="p-4 pt-3 flex items-center justify-between gap-4">
                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider pl-1">Target Model</span>
                                <Popover open={selectTitleModelPopoutState} onOpenChange={setSelectTitleModelPopoutState}>
                                    <PopoverTrigger disabled={!titleGenerateEnabled} asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={selectTitleModelPopoutState}
                                            className="w-[300px] justify-between bg-white dark:bg-gray-800 h-9 text-sm"
                                        >
                                            <div className="flex items-center gap-2 truncate">
                                                <span className="truncate font-medium">
                                                    {selectedTitleModel ? selectedTitleModel.model.label : "Select model..."}
                                                </span>
                                                {selectedTitleModel && (
                                                    <span className="text-xs text-gray-400 font-mono">
                                                        {selectedTitleModel.definition?.displayName || selectedTitleModel.account.label}
                                                    </span>
                                                )}
                                            </div>
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[300px] p-0" align="end">
                                        <Command>
                                            <CommandInput placeholder="Search model..." className="h-9" />
                                            <CommandList>
                                                <CommandEmpty>No model found.</CommandEmpty>
                                                <CommandGroup className="max-h-[300px] overflow-y-auto">
                                                    {modelOptions.map((option, idx) => (
                                                        <CommandItem
                                                            key={idx}
                                                            value={`${option.account.id}/${option.model.id}`}
                                                            onSelect={(_) => {
                                                                setSelectTitleModelPopoutState(false)
                                                                setTitleGenerateModel({
                                                                    accountId: option.account.id,
                                                                    modelId: option.model.id
                                                                })
                                                            }}
                                                            className="cursor-pointer"
                                                        >
                                                            <div className="flex flex-col">
                                                                <span>{option.model.label}</span>
                                                                <span className="text-[10px] text-gray-400">
                                                                    {option.definition?.displayName || option.account.label}
                                                                </span>
                                                            </div>
                                                            <Check
                                                                className={cn(
                                                                    "ml-auto h-4 w-4",
                                                                    titleGenerateModel
                                                                        && titleGenerateModel.accountId === option.account.id
                                                                        && titleGenerateModel.modelId === option.model.id
                                                                        ? "opacity-100"
                                                                        : "opacity-0"
                                                                )}
                                                            />
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
                </div>

                {/* WebSearch Items Setting */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5 hover:shadow-md transition-all duration-200">
                    <div className="flex items-center justify-between gap-6">
                        <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                                <Label className="text-base font-medium text-gray-900 dark:text-gray-100">
                                    Web Search Limit
                                </Label>
                                <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-orange-600 border-orange-200 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800">
                                    WEB
                                </Badge>
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                                Max number of search results to process (1-10). Higher values provide more context but increase token usage and latency.
                            </p>
                        </div>
                        <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-900 rounded-lg p-1.5 border border-gray-200 dark:border-gray-700">
                            <Input
                                min={1}
                                max={10}
                                value={maxWebSearchItems}
                                onChange={(e) => {
                                    const value = parseInt(e.target.value) || 3
                                    setMaxWebSearchItems(Math.min(Math.max(value, 1), 10))
                                }}
                                className='focus-visible:ring-transparent focus-visible:ring-offset-0 text-center px-0 h-8 w-16 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm transition-all focus:w-20 font-mono font-medium'
                            />
                            <span className="text-xs font-medium text-gray-400 pr-2">items</span>
                        </div>
                    </div>
                </div>

                {/* Memory Setting */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5 hover:shadow-md transition-all duration-200">
                    <div className="flex items-start gap-4">
                        <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                                <Label htmlFor="toggle-memory" className="text-base font-medium text-gray-900 dark:text-gray-100">
                                    Long-term Memory
                                </Label>
                                <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-green-600 border-green-200 bg-green-50 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                                    MEMORY
                                </Badge>
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                                Enable semantic memory storage and retrieval using vector embeddings. The system can remember important information across conversations.
                            </p>
                        </div>
                        <Switch
                            checked={memoryEnabled}
                            onCheckedChange={setMemoryEnabled}
                            id="toggle-memory"
                            className="data-[state=checked]:bg-green-600 mt-1"
                        />
                    </div>
                </div>

                {/* Message Compression Setting */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md">
                    <div className="p-5 flex items-start gap-4">
                        <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                                {/* onClick={(e) => e.preventDefault()} to prevent the switch from being toggled when clicking the label */}
                                <Label htmlFor="toggle-compression" className="text-base font-medium text-gray-900 dark:text-gray-100">
                                    Message Compression
                                </Label>
                                <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-cyan-600 border-cyan-200 bg-cyan-50 dark:bg-cyan-900/20 dark:text-cyan-400 dark:border-cyan-800">
                                    TOKEN
                                </Badge>
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                                Automatically compress older messages to save tokens when sending to LLM. UI always displays full original messages.
                            </p>
                        </div>
                        <Switch
                            checked={compressionEnabled}
                            onCheckedChange={setCompressionEnabled}
                            id="toggle-compression"
                            className="data-[state=checked]:bg-cyan-600 mt-1"
                        />
                    </div>
                    {/* Compression Configuration Area */}
                    <div className={cn(
                        "grid transition-all duration-300 ease-in-out bg-gray-50/50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-700/50",
                        compressionEnabled ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    )}>
                        <div className="overflow-hidden">
                            <div className="p-4 pt-3 space-y-4">
                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider pl-1">Compression Parameters</span>

                                {/* Trigger Threshold */}
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex-1">
                                        <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Trigger Threshold</Label>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Compress when message count exceeds this value</p>
                                    </div>
                                    <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-900 rounded-lg p-1.5 border border-gray-200 dark:border-gray-700">
                                        <Input
                                            min={10}
                                            max={100}
                                            value={compressionTriggerThreshold}
                                            onChange={(e) => {
                                                const value = parseInt(e.target.value) || 30
                                                setCompressionTriggerThreshold(Math.min(Math.max(value, 10), 100))
                                            }}
                                            disabled={!compressionEnabled}
                                            className='focus-visible:ring-transparent focus-visible:ring-offset-0 text-center px-0 h-8 w-16 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm font-mono font-medium transition-all focus:w-20'
                                        />
                                        <span className="text-xs font-medium text-gray-400 pr-2">msgs</span>
                                    </div>
                                </div>

                                {/* Keep Recent Count */}
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex-1">
                                        <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Keep Recent Count</Label>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Number of recent messages to keep uncompressed</p>
                                    </div>
                                    <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-900 rounded-lg p-1.5 border border-gray-200 dark:border-gray-700">
                                        <Input
                                            min={5}
                                            max={50}
                                            value={compressionKeepRecentCount}
                                            onChange={(e) => {
                                                const value = parseInt(e.target.value) || 20
                                                setCompressionKeepRecentCount(Math.min(Math.max(value, 5), 50))
                                            }}
                                            disabled={!compressionEnabled}
                                            className='focus-visible:ring-transparent focus-visible:ring-offset-0 text-center px-0 h-8 w-16 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm font-mono font-medium transition-all focus:w-20'
                                        />
                                        <span className="text-xs font-medium text-gray-400 pr-2">msgs</span>
                                    </div>
                                </div>

                                {/* Compress Count */}
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex-1">
                                        <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Compress Count</Label>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Number of oldest messages to compress each time</p>
                                    </div>
                                    <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-900 rounded-lg p-1.5 border border-gray-200 dark:border-gray-700">
                                        <Input
                                            min={5}
                                            max={30}
                                            value={compressionCompressCount}
                                            onChange={(e) => {
                                                const value = parseInt(e.target.value) || 10
                                                setCompressionCompressCount(Math.min(Math.max(value, 5), 30))
                                            }}
                                            disabled={!compressionEnabled}
                                            className='focus-visible:ring-transparent focus-visible:ring-offset-0 text-center px-0 h-8 w-16 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm font-mono font-medium transition-all focus:w-20'
                                        />
                                        <span className="text-xs font-medium text-gray-400 pr-2">msgs</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Configuration Backup */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md">
                    <div className="p-5">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <Label className="text-base font-medium text-gray-900 dark:text-gray-100">
                                    Configuration Backup
                                </Label>
                                <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-purple-600 border-purple-200 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800">
                                    Data
                                </Badge>
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                                Export your configuration to a JSON file for backup or transfer to another device. You can also import a previously saved configuration.
                            </p>
                        </div>
                    </div>
                    <div className="bg-gray-50/50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-700/50">
                        <div className="p-4 pt-3 flex items-center justify-between gap-4">
                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider pl-1">Backup & Restore</span>
                            <div className="flex items-center gap-2">
                                <Button onClick={handleExportConfig} variant="outline" size="sm" className="shadow-sm">
                                    <i className="ri-download-line mr-1.5"></i>
                                    Export Config
                                </Button>
                                <Button onClick={handleImportConfig} variant="outline" size="sm" className="shadow-sm">
                                    <i className="ri-upload-line mr-1.5"></i>
                                    Import Config
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default ToolsManager

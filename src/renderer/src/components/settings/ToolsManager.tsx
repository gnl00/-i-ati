import { Badge } from '@renderer/components/ui/badge'
import { SettingsInlineModelSelector } from '@renderer/components/shared/model-selector'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Switch } from "@renderer/components/ui/switch"
import { cn } from '@renderer/lib/utils'
import { exportConfigAsJSON, getConfig, importConfigFromJSON } from '@renderer/db/ConfigRepository'
import { useAppConfigStore } from '@renderer/store/appConfig'
import React, { useState } from 'react'
import { toast } from 'sonner'

interface ToolsManagerProps {
    maxWebSearchItems: number
    setMaxWebSearchItems: (value: number) => void
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
        getModelOptions,
        resolveModelRef,
        titleGenerateModel,
        setTitleGenerateModel,
        titleGenerateEnabled,
        setTitleGenerateEnabled,
    } = useAppConfigStore()

    const [selectTitleModelPopoutState, setSelectTitleModelPopoutState] = useState(false)
    const modelOptions = React.useMemo(() => {
        return getModelOptions()
    }, [getModelOptions])
    const selectedTitleModel = React.useMemo(() => {
        return resolveModelRef(titleGenerateModel)
    }, [resolveModelRef, titleGenerateModel])

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
            <div className='w-full h-full space-y-2 p-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700 scrollbar-track-transparent'>
                {/* Title Generation Setting */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs overflow-hidden">
                    <div className="px-4 py-4 flex items-start gap-4">
                        <div className="flex-1 space-y-1.5">
                            <div className="flex items-center gap-2">
                                <Label htmlFor="toggle-title-generation" className="text-[13.5px] font-semibold text-gray-900 dark:text-gray-100 tracking-tight cursor-default">
                                    Title Generation
                                </Label>
                                <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
                                    TITLE
                                </Badge>
                            </div>
                            <p className="text-[12px] text-gray-400 dark:text-gray-500 leading-relaxed">
                                Automatically analyze conversation context and generate concise, meaningful titles using AI models.
                            </p>
                        </div>
                        <Switch
                            checked={titleGenerateEnabled}
                            onCheckedChange={setTitleGenerateEnabled}
                            id="toggle-title-generation"
                            className="data-[state=checked]:bg-blue-500 mt-0.5 shrink-0"
                        />
                    </div>
                    {/* Model Selection Area */}
                    <div className={cn(
                        "grid transition-all duration-300 ease-in-out bg-gray-50/50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-700/50",
                        titleGenerateEnabled ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    )}>
                        <div className="overflow-hidden">
                            <div className="px-4 py-2.5 flex items-center justify-between gap-4">
                                <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Target Model</span>
                                <SettingsInlineModelSelector
                                    selectedModel={selectedTitleModel}
                                    modelOptions={modelOptions}
                                    isOpen={selectTitleModelPopoutState}
                                    onOpenChange={setSelectTitleModelPopoutState}
                                    onModelSelect={(ref) => {
                                        setSelectTitleModelPopoutState(false)
                                        setTitleGenerateModel(ref)
                                    }}
                                    disabled={!titleGenerateEnabled}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* WebSearch Items Setting */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs px-4 py-4">
                    <div className="flex items-center justify-between gap-6">
                        <div className="flex-1 space-y-1.5">
                            <div className="flex items-center gap-2">
                                <Label className="text-[13.5px] font-semibold text-gray-900 dark:text-gray-100 tracking-tight cursor-default">
                                    Web Search Limit
                                </Label>
                                <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-orange-600 border-orange-200 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800">
                                    WEB
                                </Badge>
                            </div>
                            <p className="text-[12px] text-gray-400 dark:text-gray-500 leading-relaxed">
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
                                className='focus-visible:ring-transparent focus-visible:ring-offset-0 text-center px-0 h-8 w-16 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-xs transition-all focus:w-20 font-mono font-medium'
                            />
                            <span className="text-xs font-medium text-gray-400 pr-2">items</span>
                        </div>
                    </div>
                </div>

                {/* Message Compression Setting */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs overflow-hidden">
                    <div className="px-4 py-4 flex items-start gap-4">
                        <div className="flex-1 space-y-1.5">
                            <div className="flex items-center gap-2">
                                {/* onClick={(e) => e.preventDefault()} to prevent the switch from being toggled when clicking the label */}
                                <Label htmlFor="toggle-compression" className="text-[13.5px] font-semibold text-gray-900 dark:text-gray-100 tracking-tight cursor-default">
                                    Message Compression
                                </Label>
                                <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-cyan-600 border-cyan-200 bg-cyan-50 dark:bg-cyan-900/20 dark:text-cyan-400 dark:border-cyan-800">
                                    TOKEN
                                </Badge>
                            </div>
                            <p className="text-[12px] text-gray-400 dark:text-gray-500 leading-relaxed">
                                Automatically compress older messages to save tokens when sending to LLM. UI always displays full original messages.
                            </p>
                        </div>
                        <Switch
                            checked={compressionEnabled}
                            onCheckedChange={setCompressionEnabled}
                            id="toggle-compression"
                            className="data-[state=checked]:bg-emerald-600 mt-0.5 shrink-0"
                        />
                    </div>
                    {/* Compression Configuration Area */}
                    <div className={cn(
                        "grid transition-all duration-300 ease-in-out bg-gray-50/50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-700/50",
                        compressionEnabled ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    )}>
                        <div className="overflow-hidden">
                            <div className="px-4 pt-2.5 pb-1">
                                <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Compression Parameters</span>
                            </div>
                            <div className="px-4">

                                {/* Trigger Threshold */}
                                <div className="flex items-center justify-between gap-4 py-2.5 border-b border-gray-100 dark:border-gray-800/60">
                                    <div className="flex-1">
                                        <p className="text-[12.5px] font-medium text-gray-700 dark:text-gray-300">Trigger Threshold</p>
                                        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">Compress when message count exceeds this value</p>
                                    </div>
                                    <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-900 rounded-lg p-1.5 border border-gray-200 dark:border-gray-700 shrink-0">
                                        <Input
                                            type="number"
                                            value={compressionTriggerThreshold}
                                            onChange={(e) => {
                                                const value = parseInt(e.target.value) || 30
                                                setCompressionTriggerThreshold(value)
                                            }}
                                            disabled={!compressionEnabled}
                                            className='focus-visible:ring-transparent focus-visible:ring-offset-0 text-center px-0 h-8 w-16 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-xs transition-all focus:w-20 font-mono font-medium disabled:opacity-40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
                                        />
                                        <span className="text-xs font-medium text-gray-400 pr-2">msgs</span>
                                    </div>
                                </div>

                                {/* Keep Recent Count */}
                                <div className="flex items-center justify-between gap-4 py-2.5 border-b border-gray-100 dark:border-gray-800/60">
                                    <div className="flex-1">
                                        <p className="text-[12.5px] font-medium text-gray-700 dark:text-gray-300">Keep Recent Count</p>
                                        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">Number of recent messages to keep uncompressed</p>
                                    </div>
                                    <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-900 rounded-lg p-1.5 border border-gray-200 dark:border-gray-700 shrink-0">
                                        <Input
                                            type="number"
                                            min={5}
                                            max={50}
                                            value={compressionKeepRecentCount}
                                            onChange={(e) => {
                                                const value = parseInt(e.target.value) || 20
                                                setCompressionKeepRecentCount(value)
                                            }}
                                            disabled={!compressionEnabled}
                                            className='focus-visible:ring-transparent focus-visible:ring-offset-0 text-center px-0 h-8 w-16 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-xs transition-all focus:w-20 font-mono font-medium disabled:opacity-40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
                                        />
                                        <span className="text-xs font-medium text-gray-400 pr-2">msgs</span>
                                    </div>
                                </div>

                                {/* Compress Count */}
                                <div className="flex items-center justify-between gap-4 py-2.5">
                                    <div className="flex-1">
                                        <p className="text-[12.5px] font-medium text-gray-700 dark:text-gray-300">Compress Count</p>
                                        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">Number of oldest messages to compress each time</p>
                                    </div>
                                    <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-900 rounded-lg p-1.5 border border-gray-200 dark:border-gray-700 shrink-0">
                                        <Input
                                            type="number"
                                            min={5}
                                            max={30}
                                            value={compressionCompressCount}
                                            onChange={(e) => {
                                                const value = parseInt(e.target.value) || 10
                                                setCompressionCompressCount(value)
                                            }}
                                            disabled={!compressionEnabled}
                                            className='focus-visible:ring-transparent focus-visible:ring-offset-0 text-center px-0 h-8 w-16 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-xs transition-all focus:w-20 font-mono font-medium disabled:opacity-40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
                                        />
                                        <span className="text-xs font-medium text-gray-400 pr-2">msgs</span>
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                </div>

                {/* Configuration Backup */}
                                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs overflow-hidden">
                    <div className="px-4 py-4">
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                                <Label className="text-[13.5px] font-semibold text-gray-900 dark:text-gray-100 tracking-tight cursor-default">
                                    Configuration Backup
                                </Label>
                                <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-purple-600 border-purple-200 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800">
                                    Data
                                </Badge>
                            </div>
                            <p className="text-[12px] text-gray-400 dark:text-gray-500 leading-relaxed">
                                Export your configuration to a JSON file for backup or transfer to another device. You can also import a previously saved configuration.
                            </p>
                        </div>
                    </div>
                    <div className="bg-gray-50/40 dark:bg-gray-900/20 border-t border-gray-100 dark:border-gray-700/50">
                        <div className="px-4 py-2.5 flex items-center justify-between gap-4">
                            <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Backup & Restore</span>
                            <div className="flex items-center gap-2">
                                <button onClick={handleExportConfig} className="h-7 px-3 flex items-center gap-1.5 rounded-md text-[11px] font-medium bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 active:scale-[0.97] transition-all duration-150 shadow-sm shadow-gray-900/10">
                                    <i className="ri-download-line text-[12px]" />
                                    Export
                                </button>
                                <button onClick={handleImportConfig} className="h-7 px-3 flex items-center gap-1.5 rounded-md text-[11px] font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700/50 active:scale-[0.97] transition-all duration-150">
                                    <i className="ri-upload-line text-[12px]" />
                                    Import
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default ToolsManager

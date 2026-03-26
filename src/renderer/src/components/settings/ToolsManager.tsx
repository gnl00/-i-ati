import { Badge } from '@renderer/components/ui/badge'
import { SettingsInlineModelSelector } from '@renderer/components/shared/model-selector'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'
import { Switch } from "@renderer/components/ui/switch"
import {
    invokeOpenPath,
    invokeEmotionPacksGet,
    invokeTelegramGatewayStart,
    invokeTelegramGatewayStatus,
    invokeTelegramGatewayStop,
    invokeTelegramGatewayTest
} from '@renderer/invoker/ipcInvoker'
import { cn } from '@renderer/lib/utils'
import { useAppConfigStore } from '@renderer/store/appConfig'
import { Eye, EyeOff, LoaderCircle, Send } from 'lucide-react'
import React, { useState } from 'react'
import { toast } from 'sonner'

interface ToolsManagerProps {
    maxWebSearchItems: number
    setMaxWebSearchItems: (value: number) => void
    telegramEnabled: boolean
    setTelegramEnabled: (value: boolean) => void
    telegramBotToken: string
    setTelegramBotToken: (value: string) => void
    emotionAssetPack: string
    setEmotionAssetPack: (value: string) => void
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
    telegramEnabled,
    setTelegramEnabled,
    telegramBotToken,
    setTelegramBotToken,
    emotionAssetPack,
    setEmotionAssetPack,
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
        appConfig,
        defaultModel,
        getModelOptions,
        providersRevision,
        resolveModelRef,
        setDefaultModel,
        titleGenerateModel,
        setTitleGenerateModel,
        titleGenerateEnabled,
        setTitleGenerateEnabled,
    } = useAppConfigStore()

    const [selectDefaultModelPopoutState, setSelectDefaultModelPopoutState] = useState(false)
    const [selectTitleModelPopoutState, setSelectTitleModelPopoutState] = useState(false)
    const [telegramGatewayStatus, setTelegramGatewayStatus] = useState<{
        running: boolean
        starting: boolean
        configured: boolean
        enabled: boolean
        mode?: 'polling' | 'webhook'
        hasDefaultModel: boolean
        lastUpdateId: number
        botUsername?: string
        botId?: string
        lastError?: string
        lastErrorAt?: number
        lastSuccessfulPollAt?: number
        lastMessageProcessedAt?: number
    } | null>(null)
    const [telegramTesting, setTelegramTesting] = useState(false)
    const [telegramStarting, setTelegramStarting] = useState(false)
    const [telegramStopping, setTelegramStopping] = useState(false)
    const [showTelegramBotToken, setShowTelegramBotToken] = useState(false)
    const [availableEmotionPacks, setAvailableEmotionPacks] = useState<Array<{ name: string; source: 'builtin' | 'user' }>>([
        { name: 'default', source: 'builtin' }
    ])
    const emotionPackSectionRef = React.useRef<HTMLDivElement | null>(null)
    const modelOptions = React.useMemo(() => {
        return getModelOptions()
    }, [getModelOptions, providersRevision])
    const selectedDefaultModel = React.useMemo(() => {
        return resolveModelRef(defaultModel)
    }, [defaultModel, providersRevision, resolveModelRef])
    const selectedTitleModel = React.useMemo(() => {
        return resolveModelRef(titleGenerateModel)
    }, [providersRevision, resolveModelRef, titleGenerateModel])

    const refreshTelegramGatewayStatus = async (): Promise<void> => {
        const nextStatus = await invokeTelegramGatewayStatus()
        setTelegramGatewayStatus(nextStatus)
    }

    React.useEffect(() => {
        void refreshTelegramGatewayStatus().catch(() => undefined)
        const timer = setInterval(() => {
            void refreshTelegramGatewayStatus().catch(() => undefined)
        }, 3000)

        return () => clearInterval(timer)
    }, [])

    React.useEffect(() => {
        void invokeEmotionPacksGet()
            .then((packs) => setAvailableEmotionPacks(packs.length > 0 ? packs : [{ name: 'default', source: 'builtin' }]))
            .catch(() => setAvailableEmotionPacks([{ name: 'default', source: 'builtin' }]))
    }, [])

    const formatTimestamp = (timestamp?: number): string | null => {
        if (!timestamp) return null
        try {
            return new Intl.DateTimeFormat(undefined, {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            }).format(new Date(timestamp))
        } catch {
            return null
        }
    }

    const telegramErrorTime = formatTimestamp(telegramGatewayStatus?.lastErrorAt)
    const telegramLastPollTime = formatTimestamp(telegramGatewayStatus?.lastSuccessfulPollAt)
    const telegramLastMessageTime = formatTimestamp(telegramGatewayStatus?.lastMessageProcessedAt)
    const telegramErrorLine = telegramGatewayStatus?.lastError
        ? `${telegramGatewayStatus.lastError}${telegramErrorTime ? ` · ${telegramErrorTime}` : ''}`
        : null

    return (
        <div className='w-[700px] h-[600px] focus:ring-0 focus-visible:ring-0'>
            <div className='w-full h-full space-y-2 p-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700 scrollbar-track-transparent'>
                {/* Default Model Setting */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs overflow-hidden">
                    <div className="px-4 py-4 flex items-start gap-4">
                        <div className="flex-1 space-y-1.5">
                            <div className="flex items-center gap-2">
                                <Label className="text-[13.5px] font-semibold text-gray-900 dark:text-gray-100 tracking-tight cursor-default">
                                    Default Model
                                </Label>
                                <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800">
                                    CHAT
                                </Badge>
                            </div>
                            <p className="text-[12px] text-gray-400 dark:text-gray-500 leading-relaxed">
                                Used by chat when no model is selected. If unset, the first available model in the list is used automatically.
                            </p>
                        </div>
                    </div>
                    <div className="bg-gray-50/50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-700/50">
                        <div className="px-4 py-2.5 flex items-center justify-between gap-4">
                            <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Default Target</span>
                            <div className="flex items-center gap-2">
                                <SettingsInlineModelSelector
                                    selectedModel={selectedDefaultModel}
                                    modelOptions={modelOptions}
                                    isOpen={selectDefaultModelPopoutState}
                                    onOpenChange={setSelectDefaultModelPopoutState}
                                    onModelSelect={(ref) => {
                                        setSelectDefaultModelPopoutState(false)
                                        setDefaultModel(ref)
                                    }}
                                />
                                {defaultModel && (
                                    <button
                                        type="button"
                                        className="h-8 px-2 rounded-lg text-[11px] font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                                        onClick={() => setDefaultModel(undefined)}
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

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

                {/* Emotion Pack Setting */}
                <div ref={emotionPackSectionRef} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs overflow-hidden">
                    <div className="px-4 py-4 flex items-start gap-4">
                        <div className="flex-1 space-y-1.5">
                            <div className="flex items-center gap-2">
                                <Label className="text-[13.5px] font-semibold text-gray-900 dark:text-gray-100 tracking-tight cursor-default">
                                    Emotion Pack
                                </Label>
                                <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-pink-600 border-pink-200 bg-pink-50 dark:bg-pink-900/20 dark:text-pink-400 dark:border-pink-800">
                                    EMOTION
                                </Badge>
                            </div>
                            <p className="text-[12px] text-gray-400 dark:text-gray-500 leading-relaxed">
                                Choose which emotion asset pack to render in assistant badges. Custom packs are discovered at runtime from the app emotion packs directory.
                            </p>
                        </div>
                    </div>
                    <div className="bg-gray-50/50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-700/50">
                        <div className="px-4 py-2.5 flex items-center justify-between gap-4">
                            <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Active Pack</span>
                            <div className="flex items-center gap-2">
                                <Select value={emotionAssetPack} onValueChange={setEmotionAssetPack}>
                                    <SelectTrigger
                                        className="h-8 min-w-[180px] rounded-lg bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-[12.5px]"
                                        onPointerDown={(event) => event.stopPropagation()}
                                        onClick={(event) => event.stopPropagation()}
                                    >
                                        <SelectValue placeholder="Select emotion pack" />
                                    </SelectTrigger>
                                    <SelectContent
                                        className="bg-white/20 backdrop-blur-3xl dark:bg-gray-900 rounded-lg"
                                        portalContainer={emotionPackSectionRef.current}
                                        onPointerDown={(event) => event.stopPropagation()}
                                        onClick={(event) => event.stopPropagation()}
                                    >
                                        {availableEmotionPacks.map(pack => (
                                            <SelectItem key={pack.name} value={pack.name}>
                                                {pack.name}{pack.source === 'user' ? ' (custom)' : ''}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <button
                                    type="button"
                                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-[11px] font-medium text-gray-600 shadow-xs transition hover:text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700/60 dark:hover:text-gray-100"
                                    onClick={async (event) => {
                                        event.stopPropagation()
                                        const result = await invokeOpenPath('./emotions/packs')
                                        if (!result.success) {
                                            toast.error(result.error || 'Failed to open emotion packs folder')
                                        }
                                    }}
                                >
                                    Open Packs Folder
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Telegram Channel Setting */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs overflow-hidden">
                    <div className="px-4 py-4 flex items-start gap-4">
                        <div className="flex-1 space-y-1.5">
                            <div className="flex items-center gap-2">
                                <Label htmlFor="toggle-telegram" className="text-[13.5px] font-semibold text-gray-900 dark:text-gray-100 tracking-tight cursor-default">
                                    Telegram Channel
                                </Label>
                                <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-sky-600 border-sky-200 bg-sky-50 dark:bg-sky-900/20 dark:text-sky-400 dark:border-sky-800">
                                    TELEGRAM
                                </Badge>
                            </div>
                            <p className="text-[12px] text-gray-400 dark:text-gray-500 leading-relaxed">
                                Enable Telegram bot polling. Telegram conversations use the app default model and sync into the existing chat timeline.
                            </p>
                        </div>
                        <Switch
                            checked={telegramEnabled}
                            onCheckedChange={setTelegramEnabled}
                            id="toggle-telegram"
                            className="data-[state=checked]:bg-sky-500 mt-0.5 shrink-0"
                        />
                    </div>
                    <div className={cn(
                        "grid transition-all duration-300 ease-in-out bg-gray-50/50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-700/50",
                        telegramEnabled ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    )}>
                        <div className="overflow-hidden">
                            <div className="px-4 py-3 space-y-2.5">
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex-1">
                                        <p className="text-[12.5px] font-medium text-gray-700 dark:text-gray-300">Bot Token</p>
                                        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">Stored in app config. Used for Telegram long polling and sendMessage requests.</p>
                                    </div>
                                    <div className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-1.5 shrink-0">
                                        <div className="relative w-[280px]">
                                            <Input
                                                type={showTelegramBotToken ? 'text' : 'password'}
                                                autoComplete="off"
                                                spellCheck={false}
                                                value={telegramBotToken}
                                                onChange={(e) => setTelegramBotToken(e.target.value)}
                                                placeholder="123456:ABC..."
                                                className="h-8 w-full bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-xs font-mono font-medium text-[12px] pr-9 focus-visible:ring-transparent focus-visible:ring-offset-0"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowTelegramBotToken(!showTelegramBotToken)}
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
                                                    showTelegramBotToken ? 'opacity-100 scale-100' : 'opacity-0 scale-75 absolute'
                                                )}>
                                                    <EyeOff className="w-3.5 h-3.5" />
                                                </span>
                                                <span className={cn(
                                                    'transition-all duration-300 ease-in-out',
                                                    !showTelegramBotToken ? 'opacity-100 scale-100' : 'opacity-0 scale-75 absolute'
                                                )}>
                                                    <Eye className="w-3.5 h-3.5" />
                                                </span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div className="rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-2 text-[11px] leading-relaxed text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300">
                                    Telegram gateway uses the current <span className="font-semibold">Default Model</span>. If no default model is configured, the gateway will stay disabled even if this switch is on.
                                </div>
                                <div className="flex items-start justify-between gap-4 rounded-lg border border-gray-200/70 bg-white/80 px-3 py-2.5 dark:border-gray-700/70 dark:bg-gray-950/40">
                                    <div className="min-w-0 flex-1 space-y-1">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex min-w-0 items-center gap-2">
                                                <span className="text-[12px] font-medium text-gray-700 dark:text-gray-200">Gateway Status</span>
                                                <Badge variant="outline" className={cn(
                                                    "h-5 px-1.5 text-[10px] font-normal shrink-0",
                                                    telegramGatewayStatus?.running
                                                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
                                                        : telegramGatewayStatus?.starting
                                                            ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300"
                                                            : "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
                                                )}>
                                                    {telegramGatewayStatus?.running ? 'Running' : telegramGatewayStatus?.starting ? 'Starting' : 'Stopped'}
                                                </Badge>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-2">
                                                <button
                                                    type="button"
                                                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-[11px] font-medium text-gray-600 shadow-xs transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                                                    disabled={telegramTesting || !telegramBotToken.trim()}
                                                    onClick={async () => {
                                                        try {
                                                            setTelegramTesting(true)
                                                            const result = await invokeTelegramGatewayTest(telegramBotToken.trim())
                                                            if (result.ok) {
                                                                toast.success(`Telegram connected${result.username ? ` as @${result.username}` : ''}`)
                                                            } else {
                                                                toast.error(result.error || 'Telegram connection test failed')
                                                            }
                                                        } finally {
                                                            setTelegramTesting(false)
                                                        }
                                                    }}
                                                >
                                                    {telegramTesting && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
                                                    {!telegramTesting && <Send className="h-3.5 w-3.5" />}
                                                    Test Connection
                                                </button>
                                                {telegramGatewayStatus?.running ? (
                                                    <button
                                                        type="button"
                                                        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-gray-900 px-3 text-[11px] font-medium text-white shadow-xs transition hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
                                                        disabled={telegramStopping}
                                                        onClick={async () => {
                                                            try {
                                                                setTelegramStopping(true)
                                                                await invokeTelegramGatewayStop()
                                                                await refreshTelegramGatewayStatus()
                                                                toast.success('Telegram gateway stopped')
                                                            } finally {
                                                                setTelegramStopping(false)
                                                            }
                                                        }}
                                                    >
                                                        {telegramStopping && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
                                                        Stop Gateway
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-sky-600 px-3 text-[11px] font-medium text-white shadow-xs transition hover:bg-sky-500 disabled:opacity-50 dark:bg-sky-500 dark:hover:bg-sky-400"
                                                        disabled={telegramStarting || telegramGatewayStatus?.starting}
                                                        onClick={async () => {
                                                            try {
                                                                const savedTelegram = appConfig?.telegram
                                                                const hasUnsavedTelegramChanges = telegramEnabled !== (savedTelegram?.enabled ?? false)
                                                                    || telegramBotToken !== (savedTelegram?.botToken ?? '')
                                                                if (hasUnsavedTelegramChanges) {
                                                                    toast.warning('Save Telegram settings before starting the gateway')
                                                                    return
                                                                }
                                                                setTelegramStarting(true)
                                                                const nextStatus = await invokeTelegramGatewayStart()
                                                                setTelegramGatewayStatus(nextStatus)
                                                                await refreshTelegramGatewayStatus()
                                                                toast.success(nextStatus.starting ? 'Telegram gateway is starting' : 'Telegram gateway started')
                                                            } catch (error: any) {
                                                                toast.error(error?.message || 'Failed to start Telegram gateway')
                                                            } finally {
                                                                setTelegramStarting(false)
                                                            }
                                                        }}
                                                    >
                                                        {(telegramStarting || telegramGatewayStatus?.starting) && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
                                                        {telegramGatewayStatus?.starting ? 'Starting...' : 'Start Gateway'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <p className="text-[11px] text-gray-400 dark:text-gray-500">
                                            {telegramGatewayStatus?.hasDefaultModel === false
                                                ? 'Default model missing. Save a default model before starting Telegram.'
                                                : telegramGatewayStatus?.starting
                                                    ? 'Telegram gateway is starting in the background...'
                                                : telegramGatewayStatus?.configured === false
                                                    ? 'Bot token is not configured yet.'
                                                        : telegramGatewayStatus?.botUsername
                                                            ? `Connected as @${telegramGatewayStatus.botUsername} · Last update id: ${telegramGatewayStatus?.lastUpdateId ?? 0}`
                                                            : `Last update id: ${telegramGatewayStatus?.lastUpdateId ?? 0}`}
                                        </p>
                                        {(telegramLastPollTime || telegramLastMessageTime) && (
                                            <p className="text-[11px] text-gray-400 dark:text-gray-500">
                                                {telegramLastPollTime ? `Last poll: ${telegramLastPollTime}` : ''}
                                                {telegramLastPollTime && telegramLastMessageTime ? ' · ' : ''}
                                                {telegramLastMessageTime ? `Last message: ${telegramLastMessageTime}` : ''}
                                            </p>
                                        )}
                                        {telegramErrorLine && (
                                            <p className="text-[11px] text-rose-500 dark:text-rose-400">
                                                Last error: {telegramErrorLine}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
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

            </div>
        </div>
    )
}

export default ToolsManager

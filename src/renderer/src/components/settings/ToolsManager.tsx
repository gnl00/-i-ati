import { Badge } from '@renderer/components/ui/badge'
import { SettingsInlineModelSelector } from '@renderer/components/shared/model-selector'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'
import { Switch } from "@renderer/components/ui/switch"
import { exportConfigAsJSON, getConfig, importConfigFromJSON } from '@renderer/db/ConfigRepository'
import {
    invokeOpenPath,
    invokeEmotionPacksGet,
    invokeTelegramGatewayStart,
    invokeTelegramGatewayStatus,
    invokeTelegramGatewayStop,
    invokeTelegramGatewayTest
} from '@renderer/invoker/ipcInvoker'
import { cn } from '@renderer/lib/utils'
import { createRendererLogger } from '@renderer/services/logging/rendererLogger'
import { useAppConfigStore } from '@renderer/store/appConfig'
import { Eye, EyeOff, LoaderCircle, Send } from 'lucide-react'
import React, { useState } from 'react'
import { toast } from 'sonner'
import {
    SettingsCollapsibleArea,
    SettingsControlGroup,
    SettingsFieldRow,
    SettingsPageShell,
    SettingsSection,
    SettingsSectionHeader,
    SettingsToolbar,
    SettingsToolbarLabel,
    settingsInputClassName,
    settingsOutlineButtonClassName,
    settingsPrimaryButtonClassName
} from './common/SettingsLayout'
import { Button } from '../ui/button'

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
    compressionTriggerTokenRatio: number
    setCompressionTriggerTokenRatio: (value: number) => void
    streamChunkDebugEnabled: boolean
    setStreamChunkDebugEnabled: (value: boolean) => void
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
    compressionTriggerTokenRatio,
    setCompressionTriggerTokenRatio,
    streamChunkDebugEnabled,
    setStreamChunkDebugEnabled
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
        setAppConfig,
    } = useAppConfigStore()

    const logger = React.useMemo(() => createRendererLogger('ToolsManager'), [])
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
            logger.error('config_export_failed', error)
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
                    await setAppConfig(newConfig)
                    toast.success('Config imported successfully. Reloading...')
                    setTimeout(() => window.location.reload(), 1000)
                }
            } catch (error: any) {
                logger.error('config_import_failed', error)
                toast.error('Failed to import config: ' + error.message)
            }
        }
        input.click()
    }

    const handleOpenLogs = async () => {
        try {
            const result = await invokeOpenPath('logs')
            if (!result.success) {
                toast.error(result.error || 'Failed to open logs folder')
                return
            }
            toast.success('Logs folder opened')
        } catch (error: any) {
            logger.error('logs_open_failed', error)
            toast.error(error?.message || 'Failed to open logs folder')
        }
    }

    return (
        <SettingsPageShell scrollable contentClassName="space-y-2">
            <SettingsSection>
                <SettingsSectionHeader
                    title={<Label className="cursor-default">Default Model</Label>}
                    badges={(
                        <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800">
                            CHAT
                        </Badge>
                    )}
                    description="Used by chat when no model is selected. If unset, the first available model in the list is used automatically."
                />
                <SettingsToolbar>
                    <div className="flex items-center justify-between gap-4">
                        <SettingsToolbarLabel>Default Target</SettingsToolbarLabel>
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
                                    className={cn(settingsOutlineButtonClassName, 'h-8 px-2 rounded-lg bg-white dark:bg-gray-800')}
                                    onClick={() => setDefaultModel(undefined)}
                                >
                                    Clear
                                </button>
                            )}
                        </div>
                    </div>
                </SettingsToolbar>
            </SettingsSection>

            <SettingsSection>
                <SettingsSectionHeader
                    title={(
                        <Label htmlFor="toggle-title-generation" className="cursor-default">
                            Title Generation
                        </Label>
                    )}
                    badges={(
                        <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
                            TITLE
                        </Badge>
                    )}
                    description="Automatically analyze conversation context and generate concise, meaningful titles using AI models."
                    actions={(
                        <Switch
                            checked={titleGenerateEnabled}
                            onCheckedChange={setTitleGenerateEnabled}
                            id="toggle-title-generation"
                            className="data-[state=checked]:bg-blue-500 mt-0.5 shrink-0"
                        />
                    )}
                />
                <SettingsCollapsibleArea open={titleGenerateEnabled}>
                    <div className="px-4 py-2.5 flex items-center justify-between gap-4">
                        <SettingsToolbarLabel>Target Model</SettingsToolbarLabel>
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
                </SettingsCollapsibleArea>
            </SettingsSection>

            <SettingsSection>
                <SettingsSectionHeader
                    title={<Label className="cursor-default">Web Search Limit</Label>}
                    badges={(
                        <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-orange-600 border-orange-200 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800">
                            WEB
                        </Badge>
                    )}
                    description="Max number of search results to process (1-10). Higher values provide more context but increase token usage and latency."
                    actions={(
                        <SettingsControlGroup>
                            <Input
                                min={1}
                                max={10}
                                value={maxWebSearchItems}
                                onChange={(e) => {
                                    const value = parseInt(e.target.value) || 3
                                    setMaxWebSearchItems(Math.min(Math.max(value, 1), 10))
                                }}
                                className={cn(settingsInputClassName, 'text-center px-0 h-8 w-16 transition-all focus:w-20 font-mono font-medium')}
                            />
                            <span className="text-xs font-medium text-gray-400 pr-2">items</span>
                        </SettingsControlGroup>
                    )}
                />
            </SettingsSection>

            <SettingsSection ref={emotionPackSectionRef}>
                <SettingsSectionHeader
                    title={<Label className="cursor-default">Emotion Pack</Label>}
                    badges={(
                        <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-pink-600 border-pink-200 bg-pink-50 dark:bg-pink-900/20 dark:text-pink-400 dark:border-pink-800">
                            EMOTION
                        </Badge>
                    )}
                    description="Choose which emotion asset pack to render in assistant badges. Custom packs are discovered at runtime from the app emotion packs directory."
                />
                <SettingsToolbar>
                    <div className="flex items-center justify-between gap-4">
                        <SettingsToolbarLabel>Active Pack</SettingsToolbarLabel>
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
                            <Button
                                variant="ghost"
                                size="xs"
                                className='shrink-0 flex items-center gap-1 justify-center px-2 text-[11px] h-7 font-semibold text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-all duration-200'
                                onClick={async (event) => {
                                    event.stopPropagation()
                                    const result = await invokeOpenPath('./emotions/packs')
                                    if (!result.success) {
                                        toast.error(result.error || 'Failed to open emotion packs folder')
                                    }
                                }}
                            >
                                Open Packs Folder
                            </Button>
                        </div>
                    </div>
                </SettingsToolbar>
            </SettingsSection>

            <SettingsSection>
                <SettingsSectionHeader
                    title={(
                        <Label htmlFor="toggle-telegram" className="cursor-default">
                            Telegram Channel
                        </Label>
                    )}
                    badges={(
                        <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-sky-600 border-sky-200 bg-sky-50 dark:bg-sky-900/20 dark:text-sky-400 dark:border-sky-800">
                            TELEGRAM
                        </Badge>
                    )}
                    description="Enable Telegram bot polling. Telegram conversations use the app default model and sync into the existing chat timeline."
                    actions={(
                        <Switch
                            checked={telegramEnabled}
                            onCheckedChange={setTelegramEnabled}
                            id="toggle-telegram"
                            className="data-[state=checked]:bg-sky-500 mt-0.5 shrink-0"
                        />
                    )}
                />
                <SettingsCollapsibleArea open={telegramEnabled}>
                    <div className="px-4 py-3 space-y-2.5">
                        <SettingsFieldRow
                            title="Bot Token"
                            description="Stored in app config. Used for Telegram long polling and sendMessage requests."
                            control={(
                                <SettingsControlGroup>
                                    <div className="relative w-[280px]">
                                        <Input
                                            type={showTelegramBotToken ? 'text' : 'password'}
                                            autoComplete="off"
                                            spellCheck={false}
                                            value={telegramBotToken}
                                            onChange={(e) => setTelegramBotToken(e.target.value)}
                                            placeholder="123456:ABC..."
                                            className={cn(settingsInputClassName, 'h-8 w-full font-mono font-medium text-[12px] pr-9')}
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
                                </SettingsControlGroup>
                            )}
                        />
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
                                            className={cn(settingsOutlineButtonClassName, 'h-8 rounded-full bg-white dark:bg-gray-900 shadow-xs disabled:opacity-50')}
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
                                                className={cn(settingsPrimaryButtonClassName, 'h-8 rounded-full disabled:opacity-50')}
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
                </SettingsCollapsibleArea>
            </SettingsSection>

            <SettingsSection>
                <SettingsSectionHeader
                    title={(
                        <Label htmlFor="toggle-compression" className="cursor-default">
                            Message Compression
                        </Label>
                    )}
                    badges={(
                        <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-cyan-600 border-cyan-200 bg-cyan-50 dark:bg-cyan-900/20 dark:text-cyan-400 dark:border-cyan-800">
                            TOKEN
                        </Badge>
                    )}
                    description="Automatically compress older messages to save tokens when sending to LLM. UI always displays full original messages."
                    actions={(
                        <Switch
                            checked={compressionEnabled}
                            onCheckedChange={setCompressionEnabled}
                            id="toggle-compression"
                            className="data-[state=checked]:bg-emerald-600 mt-0.5 shrink-0"
                        />
                    )}
                />
                <SettingsCollapsibleArea open={compressionEnabled}>
                    <div className="px-4 pt-2.5 pb-1">
                        <SettingsToolbarLabel>Compression Parameters</SettingsToolbarLabel>
                    </div>
                    <div className="px-4">
                        <SettingsFieldRow
                            title="Trigger Usage"
                            description="Compress after response usage reaches this share of the model context window"
                            control={(
                                <SettingsControlGroup>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={100}
                                        value={Math.round(compressionTriggerTokenRatio * 100)}
                                        onChange={(e) => {
                                            const value = parseInt(e.target.value) || 70
                                            const clamped = Math.max(1, Math.min(100, value))
                                            setCompressionTriggerTokenRatio(clamped / 100)
                                        }}
                                        disabled={!compressionEnabled}
                                        className={cn(settingsInputClassName, 'text-center px-0 h-8 w-16 transition-all focus:w-20 font-mono font-medium disabled:opacity-40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none')}
                                    />
                                    <span className="text-xs font-medium text-gray-400 pr-2">%</span>
                                </SettingsControlGroup>
                            )}
                        />
                    </div>
                </SettingsCollapsibleArea>
            </SettingsSection>

            <SettingsSection>
                <SettingsSectionHeader
                    title={<Label className="cursor-default">Configuration Backup</Label>}
                    badges={(
                        <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-purple-600 border-purple-200 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800">
                            DATA
                        </Badge>
                    )}
                    description="Export your configuration to a JSON file for backup or transfer to another device. You can also import a previously saved configuration."
                />
                <SettingsToolbar>
                    <div className="flex items-center justify-between gap-4">
                        <SettingsToolbarLabel>Backup & Restore</SettingsToolbarLabel>
                        <div className="flex items-center gap-2">
                            <button onClick={handleExportConfig} className={settingsPrimaryButtonClassName}>
                                <i className="ri-download-line text-[12px]" />
                                Export
                            </button>
                            <button onClick={handleImportConfig} className={settingsOutlineButtonClassName}>
                                <i className="ri-upload-line text-[12px]" />
                                Import
                            </button>
                        </div>
                    </div>
                </SettingsToolbar>
            </SettingsSection>

            <SettingsSection>
                <SettingsSectionHeader
                    title={<Label className="cursor-default">Logs</Label>}
                    badges={(
                        <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-slate-600 border-slate-200 bg-slate-50 dark:bg-slate-900/30 dark:text-slate-300 dark:border-slate-700">
                            LOG
                        </Badge>
                    )}
                    description="Open the application logs directory to inspect daily log files, compressed archives, and runtime diagnostics."
                />
                <SettingsToolbar>
                    <div className="flex items-center justify-between gap-4">
                        <SettingsToolbarLabel>Log Files</SettingsToolbarLabel>
                        <button
                            onClick={handleOpenLogs}
                            className={settingsOutlineButtonClassName}
                        >
                            <i className="ri-folder-open-line text-[12px]" />
                            Open Logs
                        </button>
                    </div>
                </SettingsToolbar>
            </SettingsSection>

            <SettingsSection>
                <SettingsSectionHeader
                    title={(
                        <Label htmlFor="toggle-stream-chunk-debug" className="cursor-default">
                            Debug Mode
                        </Label>
                    )}
                    badges={(
                        <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-rose-600 border-rose-200 bg-rose-50 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800">
                            REQUEST
                        </Badge>
                    )}
                    description="Log provider request bodies into the request log and raw stream chunks into the daily log. Use this while debugging streaming, parser, or provider request behavior."
                    actions={(
                        <Switch
                            checked={streamChunkDebugEnabled}
                            onCheckedChange={setStreamChunkDebugEnabled}
                            id="toggle-stream-chunk-debug"
                            className="data-[state=checked]:bg-rose-500 mt-0.5 shrink-0"
                        />
                    )}
                />
            </SettingsSection>
        </SettingsPageShell>
    )
}

export default ToolsManager

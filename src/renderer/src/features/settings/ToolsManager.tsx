import { SettingsInlineModelSelector } from '@renderer/shared/components/model-selector'
import { Input } from '@renderer/shared/components/ui/input'
import { Label } from '@renderer/shared/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/shared/components/ui/select'
import { Switch } from '@renderer/shared/components/ui/switch'
import {
  exportConfigAsJSON,
  getConfig,
  importConfigFromJSON
} from '@renderer/infrastructure/persistence/ConfigRepository'
import {
  invokeOpenPath,
  invokeEmotionPacksGet,
  invokeTelegramGatewayStart,
  invokeTelegramGatewayStatus,
  invokeTelegramGatewayStop,
  invokeTelegramGatewayTest
} from '@renderer/infrastructure/ipc'
import { cn } from '@renderer/shared/lib/utils'
import { createRendererLogger } from '@renderer/shared/logging/rendererLogger'
import { useAppConfigStore } from '@renderer/infrastructure/config/appConfig'
import { isVisionModel } from '@shared/services/ChatModelResolver'
import { Eye, EyeOff, LoaderCircle, Send, X } from 'lucide-react'
import React, { useState } from 'react'
import { toast } from 'sonner'
import {
  SettingsCollapsibleArea,
  SettingsControlGroup,
  SettingsFieldRow,
  SettingsPageShell,
  SettingsSectionHeader,
  SettingsToolbarLabel,
  settingsIconButtonClassName,
  settingsInputClassName,
  settingsOutlineButtonClassName,
  settingsPrimaryButtonClassName
} from './common/SettingsLayout'
import { Button } from '@renderer/shared/components/ui/button'

const modelRouteRowClassName =
  'flex-col items-stretch gap-2 border-t border-gray-100 px-4 py-3 first:border-t-0 dark:border-gray-700/50 sm:flex-row sm:items-center sm:gap-4'
export const modelRouteControlClassName =
  'w-full min-w-0 justify-end gap-1.5 border-0 bg-transparent p-0 dark:bg-transparent sm:w-auto'
export const modelRouteEmptyStateClassName =
  'flex h-8 w-full min-w-0 max-w-full items-center rounded-lg border border-gray-200 bg-white px-3 text-[11.5px] text-gray-400 dark:border-(--app-border-standard) dark:bg-(--app-surface-raised) dark:text-(--app-text-muted) sm:w-[260px]'
const modelRouteSelectorClassName = 'w-full min-w-0 max-w-full sm:w-[260px]'
export const emotionPackSelectTriggerClassName = cn(
  'h-8 min-w-[180px] rounded-lg border border-gray-200 bg-white px-3 text-[12.5px] text-gray-700 shadow-xs',
  'transition-[background-color,border-color,color,box-shadow] duration-150',
  'hover:border-slate-300 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-400/20',
  'data-[state=open]:border-slate-300 data-[state=open]:bg-slate-50',
  '[&>svg]:text-slate-400 [&>svg]:transition-transform [&>svg]:duration-150 data-[state=open]:[&>svg]:rotate-180',
  'dark:border-(--app-border-standard) dark:bg-(--app-surface-raised) dark:text-(--app-text-body) dark:shadow-none',
  'dark:hover:border-(--app-accent) dark:hover:bg-(--app-surface-hover) dark:hover:text-(--app-text-primary)',
  'dark:focus-visible:border-(--app-accent) dark:focus-visible:ring-(--app-border-standard)',
  'dark:data-[state=open]:border-(--app-accent) dark:data-[state=open]:bg-(--app-surface-hover) dark:data-[state=open]:text-(--app-text-primary)',
  'dark:[&>svg]:text-(--app-text-muted)'
)
export const emotionPackSelectContentClassName = cn(
  'rounded-[10px] border border-slate-200/80 bg-white text-slate-700 shadow-[0_12px_32px_rgba(15,23,42,0.14)] backdrop-blur-none',
  'dark:border-(--app-border-standard) dark:bg-(--app-surface-raised) dark:text-(--app-text-body)',
  'dark:shadow-[0_16px_40px_rgba(0,0,0,0.38)] dark:backdrop-blur-none'
)
export const emotionPackSelectItemClassName = cn(
  'h-8 rounded-md py-0 pl-8 pr-2 text-[12px] font-medium text-slate-700',
  'focus:bg-slate-100 focus:text-slate-950 data-[state=checked]:bg-slate-100/80 data-[state=checked]:text-slate-950',
  'dark:text-(--app-text-body) dark:focus:bg-(--app-surface-hover) dark:focus:text-(--app-text-primary)',
  'dark:data-[state=checked]:bg-(--app-surface-hover) dark:data-[state=checked]:text-(--app-text-primary)',
  'dark:[&_.lucide-check]:text-(--app-accent-strong)'
)

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
    mainModel,
    getModelOptions,
    providersRevision,
    resolveModelRef,
    setMainModel,
    liteModel,
    setLiteModel,
    visionModel,
    setVisionModel,
    setAppConfig
  } = useAppConfigStore()

  const logger = React.useMemo(() => createRendererLogger('ToolsManager'), [])
  const [selectMainModelPopoutState, setSelectMainModelPopoutState] =
    useState(false)
  const [selectLiteModelPopoutState, setSelectLiteModelPopoutState] =
    useState(false)
  const [selectVisionModelPopoutState, setSelectVisionModelPopoutState] =
    useState(false)
  const [telegramGatewayStatus, setTelegramGatewayStatus] = useState<{
    running: boolean
    starting: boolean
    configured: boolean
    enabled: boolean
    mode?: 'polling' | 'webhook'
    hasMainModel: boolean
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
  const [availableEmotionPacks, setAvailableEmotionPacks] = useState<
    Array<{ name: string; source: 'builtin' | 'user' }>
  >([{ name: 'default', source: 'builtin' }])
  const emotionPackSectionRef = React.useRef<HTMLDivElement | null>(null)
  const modelOptions = React.useMemo((): ReturnType<typeof getModelOptions> => {
    return getModelOptions()
  }, [getModelOptions, providersRevision])
  const visionModelOptions = React.useMemo(() => {
    return modelOptions.filter((option) => isVisionModel(option.model))
  }, [modelOptions])
  const selectedMainModel = React.useMemo(() => {
    return resolveModelRef(mainModel)
  }, [mainModel, providersRevision, resolveModelRef])
  const selectedLiteModel = React.useMemo(() => {
    return resolveModelRef(liteModel)
  }, [providersRevision, resolveModelRef, liteModel])
  const selectedVisionModel = React.useMemo(() => {
    return resolveModelRef(visionModel)
  }, [providersRevision, resolveModelRef, visionModel])

  const refreshTelegramGatewayStatus = async (): Promise<void> => {
    const nextStatus = await invokeTelegramGatewayStatus()
    setTelegramGatewayStatus(nextStatus)
  }

  React.useEffect(() => {
    void refreshTelegramGatewayStatus().catch(() => undefined)
    const timer = setInterval(() => {
      void refreshTelegramGatewayStatus().catch(() => undefined)
    }, 3000)

    return (): void => clearInterval(timer)
  }, [])

  React.useEffect(() => {
    void invokeEmotionPacksGet()
      .then((packs) =>
        setAvailableEmotionPacks(
          packs.length > 0 ? packs : [{ name: 'default', source: 'builtin' }]
        )
      )
      .catch(() =>
        setAvailableEmotionPacks([{ name: 'default', source: 'builtin' }])
      )
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
  const telegramLastPollTime = formatTimestamp(
    telegramGatewayStatus?.lastSuccessfulPollAt
  )
  const telegramLastMessageTime = formatTimestamp(
    telegramGatewayStatus?.lastMessageProcessedAt
  )
  const telegramErrorLine = telegramGatewayStatus?.lastError
    ? `${telegramGatewayStatus.lastError}${telegramErrorTime ? ` · ${telegramErrorTime}` : ''}`
    : null

  const handleExportConfig = async (): Promise<void> => {
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

  const handleImportConfig = (): void => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = async (e): Promise<void> => {
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
      } catch (error: unknown) {
        logger.error('config_import_failed', error)
        toast.error(
          'Failed to import config: ' +
            (error instanceof Error ? error.message : String(error))
        )
      }
    }
    input.click()
  }

  const handleOpenLogs = async (): Promise<void> => {
    try {
      const result = await invokeOpenPath('logs')
      if (!result.success) {
        toast.error(result.error || 'Failed to open logs folder')
        return
      }
      toast.success('Logs folder opened')
    } catch (error: unknown) {
      logger.error('logs_open_failed', error)
      toast.error(
        error instanceof Error ? error.message : 'Failed to open logs folder'
      )
    }
  }

  return (
    <SettingsPageShell scrollable contentClassName="space-y-5 pb-4">
      <section className="min-w-0">
        <SettingsSectionHeader
          className="flex-col gap-2 sm:flex-row sm:items-center [&>div:last-child]:max-w-full"
          title={<Label className="cursor-default">Model Routing</Label>}
          description="Choose defaults for chat, background tasks, and image-aware requests."
        />
        <div className="mx-4 overflow-hidden rounded-lg border border-gray-100 bg-gray-50/60 dark:border-(--app-border-subtle) dark:bg-(--app-surface-inset)">
          <SettingsFieldRow
            className={modelRouteRowClassName}
            title={
              <span className="flex min-w-0 items-center gap-2">
                <span>Main Model</span>
              </span>
            }
            description="New chat sessions use this route. Fallback: first available model."
            control={
              <SettingsControlGroup className={modelRouteControlClassName}>
                <SettingsInlineModelSelector
                  selectedModel={selectedMainModel}
                  modelOptions={modelOptions}
                  isOpen={selectMainModelPopoutState}
                  onOpenChange={setSelectMainModelPopoutState}
                  ariaLabel="Select main model"
                  triggerClassName={modelRouteSelectorClassName}
                  onModelSelect={(ref) => {
                    setSelectMainModelPopoutState(false)
                    setMainModel(ref)
                  }}
                />
                {mainModel && (
                  <button
                    type="button"
                    className={cn(
                      settingsIconButtonClassName,
                      'shrink-0 bg-white dark:bg-(--app-surface-raised)'
                    )}
                    aria-label="Clear main model"
                    title="Clear main model"
                    onClick={() => setMainModel(undefined)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </SettingsControlGroup>
            }
          />
          <SettingsFieldRow
            className={modelRouteRowClassName}
            title={
              <span className="flex min-w-0 items-center gap-2">
                <span>Lite Model</span>
              </span>
            }
            description="Title generation, Smart Messages, and scheduler jobs use this route. Fallback: Main Model."
            control={
              <SettingsControlGroup className={modelRouteControlClassName}>
                <SettingsInlineModelSelector
                  selectedModel={selectedLiteModel}
                  modelOptions={modelOptions}
                  isOpen={selectLiteModelPopoutState}
                  onOpenChange={setSelectLiteModelPopoutState}
                  ariaLabel="Select lite model"
                  triggerClassName={modelRouteSelectorClassName}
                  onModelSelect={(ref) => {
                    setSelectLiteModelPopoutState(false)
                    setLiteModel(ref)
                  }}
                />
                {liteModel && (
                  <button
                    type="button"
                    className={cn(
                      settingsIconButtonClassName,
                      'shrink-0 bg-white dark:bg-(--app-surface-raised)'
                    )}
                    aria-label="Clear lite model"
                    title="Clear lite model"
                    onClick={() => setLiteModel(undefined)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </SettingsControlGroup>
            }
          />
          <SettingsFieldRow
            className={modelRouteRowClassName}
            title={
              <span className="flex min-w-0 items-center gap-2">
                <span>Vision Model</span>
              </span>
            }
            description="Image messages use this route. Fallback: first vision-capable model, then Main Model."
            control={
              <SettingsControlGroup className={modelRouteControlClassName}>
                {visionModelOptions.length > 0 ? (
                  <SettingsInlineModelSelector
                    selectedModel={selectedVisionModel}
                    modelOptions={visionModelOptions}
                    isOpen={selectVisionModelPopoutState}
                    onOpenChange={setSelectVisionModelPopoutState}
                    ariaLabel="Select vision model"
                    triggerClassName={modelRouteSelectorClassName}
                    onModelSelect={(ref) => {
                      setSelectVisionModelPopoutState(false)
                      setVisionModel(ref)
                    }}
                  />
                ) : (
                  <div className={modelRouteEmptyStateClassName}>
                    Add a vision-capable model in Providers.
                  </div>
                )}
                {visionModel && (
                  <button
                    type="button"
                    className={cn(
                      settingsIconButtonClassName,
                      'shrink-0 bg-white dark:bg-(--app-surface-raised)'
                    )}
                    aria-label="Clear vision model"
                    title="Clear vision model"
                    onClick={() => setVisionModel(undefined)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </SettingsControlGroup>
            }
          />
        </div>
      </section>

      <section aria-label="General settings">
        <SettingsSectionHeader title="General" />
        <div className="mx-4 rounded-lg border border-gray-100 bg-gray-50/60 divide-y divide-gray-100 dark:border-(--app-border-subtle) dark:bg-(--app-surface-inset) dark:divide-(--app-border-subtle)">
          <section className="min-w-0">
            <SettingsSectionHeader
              className="flex-col gap-2 sm:flex-row sm:items-center [&>div:last-child]:max-w-full"
              title={<Label className="cursor-default">Web Search Limit</Label>}
              description="Max number of search results to process (1-10). Higher values provide more context but increase token usage and latency."
              actions={
                <SettingsControlGroup>
                  <Input
                    min={1}
                    max={10}
                    value={maxWebSearchItems}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 3
                      setMaxWebSearchItems(Math.min(Math.max(value, 1), 10))
                    }}
                    className={cn(
                      settingsInputClassName,
                      'text-center px-0 h-8 w-16 transition-all focus:w-20 font-mono font-medium'
                    )}
                  />
                  <span className="text-xs font-medium text-gray-400 pr-2">
                    items
                  </span>
                </SettingsControlGroup>
              }
            />
          </section>

          <section ref={emotionPackSectionRef} className="min-w-0">
            <SettingsSectionHeader
              className="flex-col gap-2 sm:flex-row sm:items-center [&>div:last-child]:max-w-full"
              title={<Label className="cursor-default">Emotion Pack</Label>}
              description="Choose the emotion assets used in assistant badges."
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={emotionAssetPack}
                    onValueChange={setEmotionAssetPack}
                  >
                    <SelectTrigger
                      className={emotionPackSelectTriggerClassName}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <SelectValue placeholder="Select emotion pack" />
                    </SelectTrigger>
                    <SelectContent
                      className={emotionPackSelectContentClassName}
                      portalContainer={emotionPackSectionRef.current}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {availableEmotionPacks.map((pack) => (
                        <SelectItem
                          key={pack.name}
                          value={pack.name}
                          className={emotionPackSelectItemClassName}
                        >
                          {pack.name}
                          {pack.source === 'user' ? ' (custom)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="flex h-7 shrink-0 items-center justify-center gap-1 rounded-md px-2 text-[11px] font-semibold text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700 dark:text-(--app-text-secondary) dark:hover:bg-(--app-surface-hover) dark:hover:text-(--app-text-primary)"
                    onClick={async (event) => {
                      event.stopPropagation()
                      const result = await invokeOpenPath('./emotions/packs')
                      if (!result.success) {
                        toast.error(
                          result.error || 'Failed to open emotion packs folder'
                        )
                      }
                    }}
                  >
                    Open Packs Folder
                  </Button>
                </div>
              }
            />
          </section>

          <section className="min-w-0">
            <SettingsSectionHeader
              className="flex-col gap-2 sm:flex-row sm:items-center [&>div:last-child]:max-w-full"
              title={
                <Label htmlFor="toggle-compression" className="cursor-default">
                  Message Compression
                </Label>
              }
              description="Automatically compress older messages to save tokens when sending to LLM. UI always displays full original messages."
              actions={
                <Switch
                  checked={compressionEnabled}
                  onCheckedChange={setCompressionEnabled}
                  id="toggle-compression"
                  className="shrink-0"
                />
              }
            />
            <SettingsCollapsibleArea open={compressionEnabled}>
              <div className="px-4 pt-2.5 pb-1">
                <SettingsToolbarLabel>
                  Compression Parameters
                </SettingsToolbarLabel>
              </div>
              <div className="px-4">
                <SettingsFieldRow
                  title="Trigger Usage"
                  description="Compress after response usage reaches this share of the model context window"
                  control={
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
                        className={cn(
                          settingsInputClassName,
                          'text-center px-0 h-8 w-16 transition-all focus:w-20 font-mono font-medium disabled:opacity-40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
                        )}
                      />
                      <span className="text-xs font-medium text-gray-400 pr-2">
                        %
                      </span>
                    </SettingsControlGroup>
                  }
                />
              </div>
            </SettingsCollapsibleArea>
          </section>
        </div>
      </section>

      <section className="min-w-0">
        <SettingsSectionHeader
          className="flex-col gap-2 sm:flex-row sm:items-center [&>div:last-child]:max-w-full"
          title={
            <Label htmlFor="toggle-telegram" className="cursor-default">
              Telegram Channel
            </Label>
          }
          description="Enable Telegram bot polling. Telegram conversations use the app main model and sync into the existing chat timeline."
          actions={
            <Switch
              checked={telegramEnabled}
              onCheckedChange={setTelegramEnabled}
              id="toggle-telegram"
              className="shrink-0"
            />
          }
        />
        <SettingsCollapsibleArea
          open={telegramEnabled}
          className="border-t-0 bg-transparent dark:bg-transparent"
        >
          <div className="mx-4 rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-3 space-y-2.5 dark:border-(--app-border-subtle) dark:bg-(--app-surface-inset)">
            <SettingsFieldRow
              className="flex-col items-stretch gap-2 sm:flex-row sm:items-center"
              title="Bot Token"
              description="Stored in app config. Used for Telegram long polling and sendMessage requests."
              control={
                <SettingsControlGroup className="w-full border-0 bg-transparent p-0 dark:bg-transparent sm:w-auto">
                  <div className="relative w-full min-w-0 sm:w-[260px]">
                    <Input
                      type={showTelegramBotToken ? 'text' : 'password'}
                      autoComplete="off"
                      spellCheck={false}
                      value={telegramBotToken}
                      onChange={(e) => setTelegramBotToken(e.target.value)}
                      placeholder="123456:ABC..."
                      className={cn(
                        settingsInputClassName,
                        'h-8 w-full font-mono font-medium text-[12px] pr-9'
                      )}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowTelegramBotToken(!showTelegramBotToken)
                      }
                      className={cn(
                        'absolute right-2 top-1/2 -translate-y-1/2',
                        'flex items-center justify-center p-1 rounded',
                        'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300',
                        'hover:bg-gray-100 dark:hover:bg-gray-700/50',
                        'transition-colors duration-150'
                      )}
                      tabIndex={-1}
                    >
                      <span
                        className={cn(
                          'transition-all duration-300 ease-in-out',
                          showTelegramBotToken
                            ? 'opacity-100 scale-100'
                            : 'opacity-0 scale-75 absolute'
                        )}
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                      </span>
                      <span
                        className={cn(
                          'transition-all duration-300 ease-in-out',
                          !showTelegramBotToken
                            ? 'opacity-100 scale-100'
                            : 'opacity-0 scale-75 absolute'
                        )}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </span>
                    </button>
                  </div>
                </SettingsControlGroup>
              }
            />
            <div className="text-[11px] leading-relaxed text-gray-400 dark:text-(--app-text-muted)">
              Telegram gateway uses the current{' '}
              <span className="font-semibold">Main Model</span>. Configure a
              main model before starting the gateway.
            </div>
            <div className="border-t border-gray-100 pt-3 dark:border-(--app-border-subtle)">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-[12px] font-medium text-gray-700 dark:text-gray-200">
                      Gateway Status
                    </span>
                    <span
                      className={cn(
                        'text-[11px] font-normal shrink-0',
                        telegramGatewayStatus?.running
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : telegramGatewayStatus?.starting
                            ? 'text-sky-600 dark:text-sky-400'
                            : 'text-gray-400 dark:text-(--app-text-muted)'
                      )}
                    >
                      {telegramGatewayStatus?.running
                        ? 'Running'
                        : telegramGatewayStatus?.starting
                          ? 'Starting'
                          : 'Stopped'}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className={cn(
                        settingsOutlineButtonClassName,
                        'h-8 rounded-lg bg-white dark:bg-gray-900 shadow-xs disabled:opacity-50'
                      )}
                      disabled={telegramTesting || !telegramBotToken.trim()}
                      onClick={async () => {
                        try {
                          setTelegramTesting(true)
                          const result = await invokeTelegramGatewayTest(
                            telegramBotToken.trim()
                          )
                          if (result.ok) {
                            toast.success(
                              `Telegram connected${result.username ? ` as @${result.username}` : ''}`
                            )
                          } else {
                            toast.error(
                              result.error || 'Telegram connection test failed'
                            )
                          }
                        } finally {
                          setTelegramTesting(false)
                        }
                      }}
                    >
                      {telegramTesting && (
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      )}
                      {!telegramTesting && <Send className="h-3.5 w-3.5" />}
                      Test Connection
                    </button>
                    {telegramGatewayStatus?.running ? (
                      <button
                        type="button"
                        className={cn(
                          settingsPrimaryButtonClassName,
                          'h-8 rounded-lg disabled:opacity-50'
                        )}
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
                        {telegramStopping && (
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        )}
                        Stop Gateway
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={cn(settingsPrimaryButtonClassName, 'h-8')}
                        disabled={
                          telegramStarting || telegramGatewayStatus?.starting
                        }
                        onClick={async () => {
                          try {
                            const savedTelegram = appConfig?.telegram
                            const hasUnsavedTelegramChanges =
                              telegramEnabled !==
                                (savedTelegram?.enabled ?? false) ||
                              telegramBotToken !==
                                (savedTelegram?.botToken ?? '')
                            if (hasUnsavedTelegramChanges) {
                              toast.warning(
                                'Save Telegram settings before starting the gateway'
                              )
                              return
                            }
                            setTelegramStarting(true)
                            const nextStatus =
                              await invokeTelegramGatewayStart()
                            setTelegramGatewayStatus(nextStatus)
                            await refreshTelegramGatewayStatus()
                            toast.success(
                              nextStatus.starting
                                ? 'Telegram gateway is starting'
                                : 'Telegram gateway started'
                            )
                          } catch (error: unknown) {
                            toast.error(
                              error instanceof Error
                                ? error.message
                                : 'Failed to start Telegram gateway'
                            )
                          } finally {
                            setTelegramStarting(false)
                          }
                        }}
                      >
                        {(telegramStarting ||
                          telegramGatewayStatus?.starting) && (
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        )}
                        {telegramGatewayStatus?.starting
                          ? 'Starting...'
                          : 'Start Gateway'}
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                  {telegramGatewayStatus?.hasMainModel === false
                    ? 'Main model missing. Save a main model before starting Telegram.'
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
                    {telegramLastPollTime
                      ? `Last poll: ${telegramLastPollTime}`
                      : ''}
                    {telegramLastPollTime && telegramLastMessageTime
                      ? ' · '
                      : ''}
                    {telegramLastMessageTime
                      ? `Last message: ${telegramLastMessageTime}`
                      : ''}
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
      </section>

      <section aria-label="Maintenance">
        <SettingsSectionHeader title="Maintenance" />
        <div className="mx-4 rounded-lg border border-gray-100 bg-gray-50/60 divide-y divide-gray-100 dark:border-(--app-border-subtle) dark:bg-(--app-surface-inset) dark:divide-(--app-border-subtle)">
          <section className="min-w-0">
            <SettingsSectionHeader
              className="flex-col gap-2 sm:flex-row sm:items-center [&>div:last-child]:max-w-full"
              title={
                <Label className="cursor-default">Configuration Backup</Label>
              }
              description="Export or import configuration as a JSON file."
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleExportConfig}
                    className={settingsPrimaryButtonClassName}
                  >
                    <i className="ri-download-line text-[12px]" />
                    Export
                  </button>
                  <button
                    onClick={handleImportConfig}
                    className={settingsOutlineButtonClassName}
                  >
                    <i className="ri-upload-line text-[12px]" />
                    Import
                  </button>
                </div>
              }
            />
          </section>

          <section className="min-w-0">
            <SettingsSectionHeader
              className="flex-col gap-2 sm:flex-row sm:items-center [&>div:last-child]:max-w-full"
              title={<Label className="cursor-default">Logs</Label>}
              description="Open daily logs, archives, and runtime diagnostics."
              actions={
                <button
                  onClick={handleOpenLogs}
                  className={settingsOutlineButtonClassName}
                >
                  <i className="ri-folder-open-line text-[12px]" />
                  Open Logs
                </button>
              }
            />
          </section>

          <section className="min-w-0">
            <SettingsSectionHeader
              className="flex-col gap-2 sm:flex-row sm:items-center [&>div:last-child]:max-w-full"
              title={
                <Label
                  htmlFor="toggle-stream-chunk-debug"
                  className="cursor-default"
                >
                  Debug Mode
                </Label>
              }
              description="Log provider request bodies into the request log and raw stream chunks into the daily log. Use this while debugging streaming, parser, or provider request behavior."
              actions={
                <Switch
                  checked={streamChunkDebugEnabled}
                  onCheckedChange={setStreamChunkDebugEnabled}
                  id="toggle-stream-chunk-debug"
                  className="shrink-0"
                />
              }
            />
          </section>
        </div>
      </section>
    </SettingsPageShell>
  )
}

export default ToolsManager

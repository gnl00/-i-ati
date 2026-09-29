import { AnimatedTabsList } from '@renderer/shared/components/ui/animated-tabs'
import { Tabs, TabsContent } from '@renderer/shared/components/ui/tabs'
import { cn } from '@renderer/shared/lib/utils'
import React, { useEffect, useRef, useState } from 'react'

import { Button } from '@renderer/shared/components/ui/button'
import { useAppConfigStore } from '@renderer/infrastructure/config/appConfig'
import type { RemotePluginCatalogItem } from '@shared/plugins/remoteRegistry'
import { BookOpen, Brain, Plug, Puzzle, Server, Sparkles, Wrench } from 'lucide-react'
import { toast } from 'sonner'

import KnowledgebaseManager from './KnowledgebaseManager'
import MemoryManager from './MemoryManager'
import { MCPServersManagerContent } from './mcps/MCPServersManager'
import ProvidersManager from './providers/ProvidersManager'
import ToolsManager from './ToolsManager'
import SkillsManager from './skills/SkillsManager'
import PluginsManager from './PluginsManager'
import {
    SettingsLoadingState,
    SettingsPageShell,
    settingsPrimaryButtonClassName
} from './common/SettingsLayout'

const SettingsPanel: React.FC = () => {
    const {
        appConfig,
        setAppConfig,
        accounts,
        providerDefinitions,
        mainModel,
        liteModel,
        visionModel,
        memoryEnabled,
        setMemoryEnabled,
        streamChunkDebugEnabled,
        setStreamChunkDebugEnabled,
        mcpServerConfig,
        mcpConfigLoaded,
        setMcpServerConfig,
        savedMcpServerConfig,
        saveMcpServerConfig,
        plugins,
        remotePlugins,
        pluginsLoaded,
        remotePluginsLoaded,
        savedPlugins,
        setPlugins,
        savePlugins,
        refreshPlugins,
        refreshRemotePlugins,
        installRemotePlugin,
        importLocalPlugin,
        uninstallLocalPlugin
    } = useAppConfigStore()

    const [maxWebSearchItems, setMaxWebSearchItems] = useState<number>(appConfig?.tools?.maxWebSearchItems || 3)
    const [telegramEnabled, setTelegramEnabled] = useState<boolean>(appConfig?.telegram?.enabled ?? false)
    const [telegramBotToken, setTelegramBotToken] = useState<string>(appConfig?.telegram?.botToken || '')
    const [emotionAssetPack, setEmotionAssetPack] = useState<string>(appConfig?.emotion?.assetPack || 'default')
    const [knowledgebaseEnabled, setKnowledgebaseEnabled] = useState<boolean>(appConfig?.knowledgebase?.enabled ?? false)
    const [knowledgebaseFolders, setKnowledgebaseFolders] = useState<string[]>(appConfig?.knowledgebase?.folders || [])
    const [knowledgebaseRetrievalMode, setKnowledgebaseRetrievalMode] = useState<KnowledgebaseRetrievalMode>(appConfig?.knowledgebase?.retrievalMode ?? 'tool-first')
    const [knowledgebaseAutoIndexOnStartup, setKnowledgebaseAutoIndexOnStartup] = useState<boolean>(appConfig?.knowledgebase?.autoIndexOnStartup ?? true)
    const [knowledgebaseChunkSize, setKnowledgebaseChunkSize] = useState<number>(appConfig?.knowledgebase?.chunkSize || 1200)
    const [knowledgebaseChunkOverlap, setKnowledgebaseChunkOverlap] = useState<number>(appConfig?.knowledgebase?.chunkOverlap || 200)
    const [knowledgebaseMaxResults, setKnowledgebaseMaxResults] = useState<number>(appConfig?.knowledgebase?.maxResults || 8)
    const [activeTab, setActiveTab] = useState<string>('provider-list')
    const previousSavedTelegramRef = useRef({
        enabled: appConfig?.telegram?.enabled ?? false,
        botToken: appConfig?.telegram?.botToken ?? ''
    })

    // Compression state
    const [compressionEnabled, setCompressionEnabled] = useState<boolean>(appConfig?.compression?.enabled ?? true)
    const [compressionTriggerTokenRatio, setCompressionTriggerTokenRatio] = useState<number>(appConfig?.compression?.triggerTokenRatio ?? 0.7)

    useEffect(() => {
        if (appConfig?.tools?.maxWebSearchItems !== undefined) {
            setMaxWebSearchItems(appConfig.tools.maxWebSearchItems)
        }
        if (appConfig?.compression) {
            setCompressionEnabled(appConfig.compression.enabled ?? true)
            setCompressionTriggerTokenRatio(appConfig.compression.triggerTokenRatio ?? 0.7)
        }
        setKnowledgebaseEnabled(appConfig?.knowledgebase?.enabled ?? false)
        setKnowledgebaseFolders(appConfig?.knowledgebase?.folders || [])
        setKnowledgebaseRetrievalMode(appConfig?.knowledgebase?.retrievalMode ?? 'tool-first')
        setKnowledgebaseAutoIndexOnStartup(appConfig?.knowledgebase?.autoIndexOnStartup ?? true)
        setKnowledgebaseChunkSize(appConfig?.knowledgebase?.chunkSize || 1200)
        setKnowledgebaseChunkOverlap(appConfig?.knowledgebase?.chunkOverlap || 200)
        setKnowledgebaseMaxResults(appConfig?.knowledgebase?.maxResults || 8)
        setEmotionAssetPack(appConfig?.emotion?.assetPack || 'default')
    }, [appConfig])

    useEffect(() => {
        const previousSavedTelegram = previousSavedTelegramRef.current
        const telegramDirty = telegramEnabled !== previousSavedTelegram.enabled
            || telegramBotToken !== previousSavedTelegram.botToken
        const nextSavedTelegram = {
            enabled: appConfig?.telegram?.enabled ?? false,
            botToken: appConfig?.telegram?.botToken ?? ''
        }

        if (!telegramDirty) {
            setTelegramEnabled(nextSavedTelegram.enabled)
            setTelegramBotToken(nextSavedTelegram.botToken)
        }

        previousSavedTelegramRef.current = nextSavedTelegram
        // Intentionally only react to saved-config changes; local draft edits should
        // not re-run this sync path.
    }, [appConfig])

    const saveConfigurationClick = async (): Promise<void> => {
        const savedToolSettings = appConfig?.tools || {}
        const updatedAppConfig = {
            ...(appConfig || {}),
            accounts: accounts,
            providerDefinitions: providerDefinitions,
            tools: {
                ...savedToolSettings,
                mainModel,
                liteModel,
                visionModel,
                maxWebSearchItems: maxWebSearchItems,
                memoryEnabled: memoryEnabled,
                streamChunkDebugEnabled: streamChunkDebugEnabled
            },
            telegram: {
                ...(appConfig.telegram || {}),
                enabled: telegramEnabled,
                botToken: telegramBotToken,
                mode: appConfig.telegram?.mode || 'polling',
                requireMentionInGroups: appConfig.telegram?.requireMentionInGroups ?? true,
                dmPolicy: appConfig.telegram?.dmPolicy || 'open',
                groupPolicy: appConfig.telegram?.groupPolicy || 'open'
            },
            emotion: {
                ...(appConfig.emotion || {}),
                assetPack: emotionAssetPack || 'default'
            },
            knowledgebase: {
                ...(appConfig.knowledgebase || {}),
                enabled: knowledgebaseEnabled,
                folders: knowledgebaseFolders,
                retrievalMode: knowledgebaseRetrievalMode,
                autoIndexOnStartup: knowledgebaseAutoIndexOnStartup,
                chunkSize: knowledgebaseChunkSize,
                chunkOverlap: knowledgebaseChunkOverlap,
                maxResults: knowledgebaseMaxResults
            },
            compression: {
                ...(appConfig.compression || {}),
                enabled: compressionEnabled,
                triggerTokenRatio: compressionTriggerTokenRatio,
                autoCompress: true
            }
        }

        await Promise.all([
            setAppConfig(updatedAppConfig),
            saveMcpServerConfig(mcpServerConfig),
            savePlugins(plugins)
        ])
        toast.success('Save configurations success')
    }

    const preferenceTabs = [
        {
            value: 'provider-list',
            label: 'Providers',
            icon: <Server className="w-3 h-3" />
        },
        {
            value: 'tools',
            label: 'Tools',
            icon: <Wrench className="w-3 h-3" />
        },
        {
            value: 'memory',
            label: 'Memory',
            icon: <Brain className="w-3 h-3" />
        },
        {
            value: 'knowledgebase',
            label: 'Knowledge Base',
            icon: <BookOpen className="w-3 h-3" />
        },
        {
            value: 'mcp-servers',
            label: 'MCP Servers',
            icon: <Plug className="w-3 h-3" />
        },
        {
            value: 'skills',
            label: 'Skills',
            icon: <Sparkles className="w-3 h-3" />
        },
        {
            value: 'plugins',
            label: 'Plugins',
            icon: <Puzzle className="w-3 h-3" />
        }
    ]

    const savedTools = appConfig?.tools || {}
    const savedKnowledgebase = appConfig?.knowledgebase
    const savedCompression = appConfig?.compression
    const savedMcpConfig = savedMcpServerConfig || { mcpServers: {} }

    const toolsDirty = maxWebSearchItems !== (savedTools.maxWebSearchItems ?? 3)
        || memoryEnabled !== (savedTools.memoryEnabled ?? true)
        || streamChunkDebugEnabled !== (savedTools.streamChunkDebugEnabled ?? false)
        || telegramEnabled !== (appConfig?.telegram?.enabled ?? false)
        || telegramBotToken !== (appConfig?.telegram?.botToken ?? '')
        || emotionAssetPack !== (appConfig?.emotion?.assetPack ?? 'default')
        || mainModel?.accountId !== savedTools.mainModel?.accountId
        || mainModel?.modelId !== savedTools.mainModel?.modelId
        || liteModel?.accountId !== savedTools.liteModel?.accountId
        || liteModel?.modelId !== savedTools.liteModel?.modelId
        || visionModel?.accountId !== savedTools.visionModel?.accountId
        || visionModel?.modelId !== savedTools.visionModel?.modelId

    const compressionDirty = compressionEnabled !== (savedCompression?.enabled ?? true)
        || compressionTriggerTokenRatio !== (savedCompression?.triggerTokenRatio ?? 0.7)

    const knowledgebaseDirty = knowledgebaseEnabled !== (savedKnowledgebase?.enabled ?? false)
        || knowledgebaseRetrievalMode !== (savedKnowledgebase?.retrievalMode ?? 'tool-first')
        || knowledgebaseAutoIndexOnStartup !== (savedKnowledgebase?.autoIndexOnStartup ?? true)
        || knowledgebaseChunkSize !== (savedKnowledgebase?.chunkSize ?? 1200)
        || knowledgebaseChunkOverlap !== (savedKnowledgebase?.chunkOverlap ?? 200)
        || knowledgebaseMaxResults !== (savedKnowledgebase?.maxResults ?? 8)
        || JSON.stringify(knowledgebaseFolders) !== JSON.stringify(savedKnowledgebase?.folders ?? [])

    const mcpDirty = mcpConfigLoaded
        && JSON.stringify(mcpServerConfig ?? {}) !== JSON.stringify(savedMcpConfig ?? {})
    const pluginsDirty = pluginsLoaded
        && JSON.stringify(plugins) !== JSON.stringify(savedPlugins)

    const hasUnsavedChanges = toolsDirty || knowledgebaseDirty || compressionDirty || mcpDirty || pluginsDirty

    return (
        <div className="settings-graphite w-full h-full min-h-0 min-w-0 overflow-hidden dark:bg-(--app-canvas) dark:text-(--app-text-body)">
            <Tabs value={activeTab} onValueChange={setActiveTab} defaultValue="provider-list" className="w-full h-full min-w-0 min-h-0 flex flex-col">
                <div className="w-full h-full min-h-0 min-w-0 overflow-hidden rounded-xl border-none bg-white dark:bg-(--app-surface) shadow-xs dark:shadow-none flex flex-col">
                    <div className="flex min-w-0 shrink-0 items-center justify-between gap-3 px-1 py-2">
                        <h4 id="title" className="min-w-0 select-none truncate text-[13.5px] font-semibold leading-none tracking-tight text-(--app-text-primary)">
                            Settings
                        </h4>
                        <div id="changes-indicator" className="flex min-w-0 items-center justify-end gap-3">
                            <div role="status" className="flex h-7 min-w-0 items-center gap-2">
                                <span className={cn(
                                    'h-1.5 w-1.5 shrink-0 rounded-full',
                                    hasUnsavedChanges ? 'bg-amber-500' : 'bg-emerald-400'
                                )} />
                                <span className="select-none truncate text-[11px] font-medium text-(--app-text-secondary)">
                                    {hasUnsavedChanges ? 'Unsaved changes' : 'All saved'}
                                </span>
                            </div>
                            <Button
                                size="sm"
                                onClick={saveConfigurationClick}
                                disabled={!hasUnsavedChanges}
                                className={cn(settingsPrimaryButtonClassName, 'h-7 shrink-0 rounded-md px-3 py-0 shadow-none disabled:bg-(--app-surface-inset) disabled:text-(--app-text-muted) dark:disabled:bg-(--app-surface-inset) dark:disabled:text-(--app-text-muted) disabled:opacity-100')}
                            >
                                <i className="ri-save-line text-[13px]"></i>
                                Save
                            </Button>
                        </div>
                    </div>
                    <div className="min-w-0 shrink-0 px-1 pb-1">
                        <AnimatedTabsList
                            tabs={preferenceTabs}
                            value={activeTab}
                            scrollable
                            autoScrollActive
                            className="w-full min-w-0"
                            tabsListClassName="h-9 shadow-none border border-(--app-border-subtle) bg-transparent dark:bg-(--app-surface-inset) [&>div]:shadow-none [&>div]:border-(--app-border-subtle)"
                            tabsTriggerClassName="h-7 px-3 text-[11.5px] font-medium data-[state=active]:shadow-none dark:text-(--app-text-secondary) dark:data-[state=active]:text-(--app-text-primary)"
                        />
                    </div>

                    <TabsContent value="provider-list" className="mt-0 w-full min-w-0 flex-1 min-h-0 focus:ring-0 focus-visible:ring-0">
                        <ProvidersManager plugins={plugins} />
                    </TabsContent>

                    <TabsContent value="tools" className="mt-0 w-full min-w-0 flex-1 min-h-0 focus:ring-0 focus-visible:ring-0">
                        <ToolsManager
                            maxWebSearchItems={maxWebSearchItems}
                            setMaxWebSearchItems={setMaxWebSearchItems}
                            telegramEnabled={telegramEnabled}
                            setTelegramEnabled={setTelegramEnabled}
                            telegramBotToken={telegramBotToken}
                            setTelegramBotToken={setTelegramBotToken}
                            emotionAssetPack={emotionAssetPack}
                            setEmotionAssetPack={setEmotionAssetPack}
                            compressionEnabled={compressionEnabled}
                            setCompressionEnabled={setCompressionEnabled}
                            compressionTriggerTokenRatio={compressionTriggerTokenRatio}
                            setCompressionTriggerTokenRatio={setCompressionTriggerTokenRatio}
                            streamChunkDebugEnabled={streamChunkDebugEnabled}
                            setStreamChunkDebugEnabled={setStreamChunkDebugEnabled}
                        />
                    </TabsContent>

                    <TabsContent value="memory" className="mt-0 w-full min-w-0 flex-1 min-h-0 focus:ring-0 focus-visible:ring-0">
                        <MemoryManager
                            memoryEnabled={memoryEnabled}
                            setMemoryEnabled={setMemoryEnabled}
                        />
                    </TabsContent>

                    <TabsContent value="knowledgebase" className="mt-0 w-full min-w-0 flex-1 min-h-0 focus:ring-0 focus-visible:ring-0">
                        <KnowledgebaseManager
                            enabled={knowledgebaseEnabled}
                            setEnabled={setKnowledgebaseEnabled}
                            folders={knowledgebaseFolders}
                            setFolders={setKnowledgebaseFolders}
                            retrievalMode={knowledgebaseRetrievalMode}
                            setRetrievalMode={setKnowledgebaseRetrievalMode}
                            autoIndexOnStartup={knowledgebaseAutoIndexOnStartup}
                            setAutoIndexOnStartup={setKnowledgebaseAutoIndexOnStartup}
                            chunkSize={knowledgebaseChunkSize}
                            setChunkSize={setKnowledgebaseChunkSize}
                            chunkOverlap={knowledgebaseChunkOverlap}
                            setChunkOverlap={setKnowledgebaseChunkOverlap}
                            maxResults={knowledgebaseMaxResults}
                            setMaxResults={setKnowledgebaseMaxResults}
                        />
                    </TabsContent>

                    <TabsContent value="mcp-servers" className="mt-0 w-full min-w-0 flex-1 min-h-0 focus:ring-0 focus-visible:ring-0">
                        <SettingsPageShell>
                            {!mcpConfigLoaded ? (
                                <SettingsLoadingState className="h-full">
                                    Loading MCP configuration...
                                </SettingsLoadingState>
                            ) : (
                                <MCPServersManagerContent
                                    mcpServerConfig={mcpServerConfig}
                                    setMcpServerConfig={setMcpServerConfig}
                                />
                            )}
                        </SettingsPageShell>
                    </TabsContent>

                    <TabsContent value="skills" className="mt-0 w-full min-w-0 flex-1 min-h-0 focus:ring-0 focus-visible:ring-0">
                        <SkillsManager />
                    </TabsContent>

                    <TabsContent value="plugins" className="mt-0 w-full min-w-0 flex-1 min-h-0 focus:ring-0 focus-visible:ring-0">
                        <PluginsManager
                            plugins={plugins}
                            remotePlugins={remotePlugins as RemotePluginCatalogItem[]}
                            pluginsLoaded={pluginsLoaded}
                            remotePluginsLoaded={remotePluginsLoaded}
                            setPlugins={setPlugins}
                            refreshPlugins={refreshPlugins}
                            refreshRemotePlugins={refreshRemotePlugins}
                            installRemotePlugin={installRemotePlugin}
                            importLocalPlugin={importLocalPlugin}
                            uninstallLocalPlugin={uninstallLocalPlugin}
                        />
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    )
}

export default SettingsPanel

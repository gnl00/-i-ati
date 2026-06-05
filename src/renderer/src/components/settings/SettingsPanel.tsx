import { AnimatedTabsList } from '@renderer/components/ui/animated-tabs'
import { Tabs, TabsContent } from "@renderer/components/ui/tabs"
import { cn } from '@renderer/lib/utils'
import React, { useEffect, useRef, useState } from 'react'

import { Badge } from '@renderer/components/ui/badge'
import { Button } from "@renderer/components/ui/button"
import { useAppConfigStore } from '@renderer/store/appConfig'
import type { RemotePluginCatalogItem } from '@shared/plugins/remoteRegistry'
import { BookOpen, Brain, Database, Plug, Puzzle, Server, Sparkles, Wrench } from "lucide-react"
import { toast } from 'sonner'

import KnowledgebaseManager from './KnowledgebaseManager'
import MemoryManager from './MemoryManager'
import { MCPServersManagerContent } from './mcps/MCPServersManager'
import ProvidersManager from './providers/ProvidersManager'
import ToolsManager from './ToolsManager'
import SkillsManager from './skills/SkillsManager'
import PluginsManager from './PluginsManager'
import DataAndLogManager from './DataAndLogManager'
import {
    SettingsLoadingState,
    SettingsPageShell,
    settingsPrimaryButtonClassName
} from './common/SettingsLayout'

interface PreferenceProps { }

const PreferenceComponent: React.FC<PreferenceProps> = () => {
    const {
        appVersion,
        appConfig,
        setAppConfig,
        accounts,
        providerDefinitions,
        defaultModel,
        titleGenerateModel,
        titleGenerateEnabled,
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [appConfig])

    const saveConfigurationClick = async (): Promise<void> => {
        const updatedAppConfig = {
            ...appConfig,
            accounts: accounts,
            providerDefinitions: providerDefinitions,
            tools: {
                ...appConfig.tools,
                defaultModel: defaultModel,
                titleGenerateModel: titleGenerateModel,
                titleGenerateEnabled: titleGenerateEnabled,
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
        },
        {
            value: 'data-log',
            label: 'Data & Log',
            icon: <Database className="w-3 h-3" />
        }
    ]

    const savedTools = appConfig?.tools || {}
    const savedKnowledgebase = appConfig?.knowledgebase
    const savedCompression = appConfig?.compression
    const savedMcpConfig = savedMcpServerConfig || { mcpServers: {} }

    const toolsDirty = maxWebSearchItems !== (savedTools.maxWebSearchItems ?? 3)
        || titleGenerateEnabled !== (savedTools.titleGenerateEnabled ?? true)
        || memoryEnabled !== (savedTools.memoryEnabled ?? true)
        || streamChunkDebugEnabled !== (savedTools.streamChunkDebugEnabled ?? false)
        || telegramEnabled !== (appConfig?.telegram?.enabled ?? false)
        || telegramBotToken !== (appConfig?.telegram?.botToken ?? '')
        || emotionAssetPack !== (appConfig?.emotion?.assetPack ?? 'default')
        || defaultModel?.accountId !== savedTools.defaultModel?.accountId
        || defaultModel?.modelId !== savedTools.defaultModel?.modelId
        || titleGenerateModel?.accountId !== savedTools.titleGenerateModel?.accountId
        || titleGenerateModel?.modelId !== savedTools.titleGenerateModel?.modelId

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
        <div className="w-full h-full min-h-0 min-w-0 overflow-hidden">
            <Tabs value={activeTab} onValueChange={setActiveTab} defaultValue="provider-list" className="w-full h-full min-w-0 min-h-0 flex flex-col">
                <div className="w-full h-full min-h-0 min-w-0 overflow-hidden rounded-xl border-none p-0 bg-white dark:bg-gray-800 shadow-xs flex flex-col">
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 p-1">
                        <div id="title" className="min-w-[180px] flex-1 select-none space-y-1.5">
                            <h4 className="flex min-w-0 items-center gap-2 text-[13.5px] font-semibold leading-none tracking-tight text-gray-900 dark:text-gray-100">
                                <span className="truncate">@i Settings</span>
                                <Badge variant="secondary" className="h-5 shrink-0 rounded-md bg-gray-100 px-1.5 text-[10.5px] font-medium text-gray-600 dark:bg-gray-900 dark:text-gray-300">
                                    {appVersion}
                                </Badge>
                            </h4>
                            <p className="text-[12px] leading-relaxed text-gray-400 dark:text-gray-500">
                                Shape how @i works and connects.
                            </p>
                        </div>
                        <div id="changes-indicator" className="flex max-w-full min-w-0 flex-wrap items-center justify-end gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/35 px-2 py-1.5">
                            <div className="flex h-7 min-w-0 items-center gap-2 px-1">
                                <div className="relative flex h-1.5 w-1.5 shrink-0">
                                    {hasUnsavedChanges && (
                                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span>
                                    )}
                                    <span className={hasUnsavedChanges
                                        ? "relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500"
                                        : "relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400"
                                    }></span>
                                </div>
                                <span className="select-none truncate text-[11px] font-medium text-gray-500 dark:text-gray-400">
                                    {hasUnsavedChanges ? 'Unsaved changes' : 'All saved'}
                                </span>
                            </div>
                            <div className="hidden h-4 w-px bg-gray-200 dark:bg-gray-700 sm:block"></div>
                            <Button
                                size="sm"
                                onClick={saveConfigurationClick}
                                disabled={!hasUnsavedChanges}
                                className={cn(settingsPrimaryButtonClassName, 'h-7 rounded-md px-3 py-0 shadow-none')}
                            >
                                <i className="ri-save-line text-[13px]"></i>
                                Save
                            </Button>
                        </div>
                    </div>
                    <div className="min-w-0 bg-gray-50/50 dark:bg-gray-900/25 px-1.5 py-0.5">
                        <AnimatedTabsList
                            tabs={preferenceTabs}
                            value={activeTab}
                            scrollable
                            autoScrollActive
                            className="w-full min-w-0"
                            tabsListClassName="h-9 shadow-none border border-gray-200/70 dark:border-gray-700/70 bg-white/80 dark:bg-gray-800/70"
                            tabsTriggerClassName="h-7 px-3 text-[11.5px] font-medium"
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

                    <TabsContent value="data-log" className="mt-0 w-full min-w-0 flex-1 min-h-0 focus:ring-0 focus-visible:ring-0">
                        <DataAndLogManager
                            streamChunkDebugEnabled={streamChunkDebugEnabled}
                            setStreamChunkDebugEnabled={setStreamChunkDebugEnabled}
                        />
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    )
}

export default PreferenceComponent

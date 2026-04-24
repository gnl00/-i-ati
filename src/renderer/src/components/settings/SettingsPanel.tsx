import { AnimatedTabsList } from '@renderer/components/ui/animated-tabs'
import { Tabs, TabsContent } from "@renderer/components/ui/tabs"
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

interface PreferenceProps { }

const PreferenceComponent: React.FC<PreferenceProps> = () => {
    const {
        appVersion,
        appConfig,
        setAppConfig,
        accounts,
        providerDefinitions,
        providersRevision,
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
    const [compressionTriggerThreshold, setCompressionTriggerThreshold] = useState<number>(appConfig?.compression?.triggerThreshold || 30)
    const [compressionKeepRecentCount, setCompressionKeepRecentCount] = useState<number>(appConfig?.compression?.keepRecentCount || 20)
    const [compressionCompressCount, setCompressionCompressCount] = useState<number>(appConfig?.compression?.compressCount || 10)

    useEffect(() => {
        if (appConfig?.tools?.maxWebSearchItems !== undefined) {
            setMaxWebSearchItems(appConfig.tools.maxWebSearchItems)
        }
        if (appConfig?.compression) {
            setCompressionEnabled(appConfig.compression.enabled ?? true)
            setCompressionTriggerThreshold(appConfig.compression.triggerThreshold || 30)
            setCompressionKeepRecentCount(appConfig.compression.keepRecentCount || 20)
            setCompressionCompressCount(appConfig.compression.compressCount || 10)
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
                enabled: compressionEnabled,
                triggerThreshold: compressionTriggerThreshold,
                keepRecentCount: compressionKeepRecentCount,
                compressCount: compressionCompressCount,
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
        || compressionTriggerThreshold !== (savedCompression?.triggerThreshold ?? 30)
        || compressionKeepRecentCount !== (savedCompression?.keepRecentCount ?? 20)
        || compressionCompressCount !== (savedCompression?.compressCount ?? 10)

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

    const hasUnsavedChanges = providersRevision > 0 || toolsDirty || knowledgebaseDirty || compressionDirty || mcpDirty || pluginsDirty

    return (
        <div className="grid gap-4 w-full min-w-0">
            <div className="flex items-start justify-between gap-4 min-w-0">
                <div id="title" className="space-y-2 select-none min-w-0 flex-1">
                    <h4 className="font-medium leading-none space-x-2 text-gray-900 dark:text-gray-100">
                        <span>@i</span>
                        <Badge variant="secondary" className='bg-slate-100 dark:bg-slate-800 text-gray-800 dark:text-gray-200'>{appVersion}</Badge>
                    </h4>
                    <p className="text-sm text-muted-foreground dark:text-gray-400">Shape how @i works and connects.</p>
                </div>
                <div id="changes-indicator" className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-linear-to-br from-gray-50 to-gray-100/50 dark:from-gray-800/40 dark:to-gray-900/40 border border-gray-200/60 dark:border-gray-700/60 backdrop-blur-xs shrink-0">
                    <div className="flex items-center gap-2">
                        <div className="relative flex h-1.5 w-1.5">
                            {hasUnsavedChanges && (
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                            )}
                            <span className={hasUnsavedChanges
                                ? "relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500"
                                : "relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400"
                            }></span>
                        </div>
                        <span className='text-xs font-medium text-gray-600 dark:text-gray-300 select-none'>
                            {hasUnsavedChanges ? 'Unsaved changes' : 'All saved'}
                        </span>
                    </div>
                    <div className="h-3 w-px bg-gray-300 dark:bg-gray-600"></div>
                    <Button
                        size="lg"
                        onClick={saveConfigurationClick}
                        disabled={!hasUnsavedChanges}
                        className="h-7 px-3 py-4 bg-gray-900 rounded-3xl hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-50 text-white dark:text-gray-900 shadow-xs hover:shadow-md active:scale-90 transition-all duration-300 scale-105 font-medium will-change-transform"
                    >
                        <i className="ri-save-line mr-1.5 text-sm"></i>
                        Save
                    </Button>
                </div>
            </div>
            <Tabs value={activeTab} onValueChange={setActiveTab} defaultValue="provider-list" className="w-full min-w-0">
                <div className="flex items-center justify-between mb-2 min-w-0">
                    <AnimatedTabsList
                        tabs={preferenceTabs}
                        value={activeTab}
                        scrollable
                        autoScrollActive
                        className="flex-1 min-w-0"
                        tabsListClassName="h-10 shadow-xs border border-gray-200/50 dark:border-gray-700/50"
                    />
                </div>

                <TabsContent value="provider-list">
                    <ProvidersManager plugins={plugins} />
                </TabsContent>

                <TabsContent value="tools">
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
                        compressionTriggerThreshold={compressionTriggerThreshold}
                        setCompressionTriggerThreshold={setCompressionTriggerThreshold}
                        compressionKeepRecentCount={compressionKeepRecentCount}
                        setCompressionKeepRecentCount={setCompressionKeepRecentCount}
                        compressionCompressCount={compressionCompressCount}
                        setCompressionCompressCount={setCompressionCompressCount}
                    />
                </TabsContent>

                <TabsContent value="memory">
                    <MemoryManager
                        memoryEnabled={memoryEnabled}
                        setMemoryEnabled={setMemoryEnabled}
                    />
                </TabsContent>

                <TabsContent value="knowledgebase">
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

                <TabsContent value="mcp-servers" className='w-[700px] h-[600px] focus:ring-0 focus-visible:ring-0'>
                    <div className="w-full h-full bg-gray-50 dark:bg-gray-900 p-2 rounded-md">
                        <div className="w-full h-full bg-white dark:bg-gray-800 rounded-lg shadow-xs border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
                            {!mcpConfigLoaded ? (
                                <div className="w-full h-full flex items-center justify-center text-[12px] text-gray-400 dark:text-gray-500">
                                    Loading MCP configuration...
                                </div>
                            ) : (
                                <MCPServersManagerContent
                                    mcpServerConfig={mcpServerConfig}
                                    setMcpServerConfig={setMcpServerConfig}
                                />
                            )}
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="skills">
                    <SkillsManager />
                </TabsContent>

                <TabsContent value="plugins">
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

                <TabsContent value="data-log">
                    <DataAndLogManager
                        streamChunkDebugEnabled={streamChunkDebugEnabled}
                        setStreamChunkDebugEnabled={setStreamChunkDebugEnabled}
                    />
                </TabsContent>
            </Tabs>
        </div>
    )
}

export default PreferenceComponent

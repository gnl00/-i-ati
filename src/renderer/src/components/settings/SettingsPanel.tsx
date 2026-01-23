import { AnimatedTabsList } from '@renderer/components/ui/animated-tabs'
import { Tabs, TabsContent } from "@renderer/components/ui/tabs"
import React, { useEffect, useState } from 'react'

import { Badge } from '@renderer/components/ui/badge'
import { Button } from "@renderer/components/ui/button"
import { useChatStore } from '@renderer/store'
import { useAppConfigStore } from '@renderer/store/appConfig'
import { Plug, Server, Sparkles, Wrench } from "lucide-react"
import { toast } from 'sonner'

import { MCPServersManagerContent } from './MCPServersManager'
import ProvidersManager from './providers/ProvidersManager'
import ToolsManager from './ToolsManager'
import SkillsManager from './SkillsManager'

interface PreferenceProps { }

const PreferenceComponent: React.FC<PreferenceProps> = () => {
    const { appVersion } = useChatStore()

    const {
        appConfig,
        setAppConfig,
        accounts,
        providerDefinitions,
        providersRevision,
        titleGenerateModel,
        titleGenerateEnabled,
        memoryEnabled,
        setMemoryEnabled,
        mcpServerConfig,
        setMcpServerConfig,
    } = useAppConfigStore()

    const [maxWebSearchItems, setMaxWebSearchItems] = useState<number>(appConfig?.tools?.maxWebSearchItems || 3)
    const [msConfig, setmsConfig] = useState<string>(JSON.stringify(mcpServerConfig, null, 2))
    const [activeTab, setActiveTab] = useState<string>('provider-list')

    // Compression state
    const [compressionEnabled, setCompressionEnabled] = useState<boolean>(appConfig?.compression?.enabled ?? true)
    const [compressionTriggerThreshold, setCompressionTriggerThreshold] = useState<number>(appConfig?.compression?.triggerThreshold || 30)
    const [compressionKeepRecentCount, setCompressionKeepRecentCount] = useState<number>(appConfig?.compression?.keepRecentCount || 20)
    const [compressionCompressCount, setCompressionCompressCount] = useState<number>(appConfig?.compression?.compressCount || 10)

    useEffect(() => {
        setmsConfig(JSON.stringify(mcpServerConfig, null, 2))
    }, [mcpServerConfig])

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
    }, [appConfig])

    const saveConfigurationClick = (): void => {
        const updatedAppConfig = {
            ...appConfig,
            accounts: accounts,
            providerDefinitions: providerDefinitions,
            tools: {
                ...appConfig.tools,
                titleGenerateModel: titleGenerateModel,
                titleGenerateEnabled: titleGenerateEnabled,
                maxWebSearchItems: maxWebSearchItems,
                memoryEnabled: memoryEnabled
            },
            compression: {
                enabled: compressionEnabled,
                triggerThreshold: compressionTriggerThreshold,
                keepRecentCount: compressionKeepRecentCount,
                compressCount: compressionCompressCount,
                autoCompress: true
            },
            mcp: {
                ...JSON.parse(msConfig)
            }
        }

        setAppConfig(updatedAppConfig)
        toast.success('Save configurations success')
    }

    const preferenceTabs = [
        {
            value: 'provider-list',
            label: 'Providers',
            icon: <Server className="w-3 h-3" />
        },
        {
            value: 'tool',
            label: 'Tool',
            icon: <Wrench className="w-3 h-3" />
        },
        {
            value: 'mcp-server',
            label: 'MCP Server',
            icon: <Plug className="w-3 h-3" />
        },
        {
            value: 'skills',
            label: 'Skills',
            icon: <Sparkles className="w-3 h-3" />
        }
    ]

    const savedTools = appConfig?.tools || {}
    const savedCompression = appConfig?.compression
    const savedMcpConfig = appConfig?.mcp || {}

    const toolsDirty = maxWebSearchItems !== (savedTools.maxWebSearchItems ?? 3)
        || titleGenerateEnabled !== (savedTools.titleGenerateEnabled ?? true)
        || memoryEnabled !== (savedTools.memoryEnabled ?? true)
        || titleGenerateModel?.accountId !== savedTools.titleGenerateModel?.accountId
        || titleGenerateModel?.modelId !== savedTools.titleGenerateModel?.modelId

    const compressionDirty = compressionEnabled !== (savedCompression?.enabled ?? true)
        || compressionTriggerThreshold !== (savedCompression?.triggerThreshold ?? 30)
        || compressionKeepRecentCount !== (savedCompression?.keepRecentCount ?? 20)
        || compressionCompressCount !== (savedCompression?.compressCount ?? 10)

    const mcpDirty = JSON.stringify(mcpServerConfig ?? {}) !== JSON.stringify(savedMcpConfig ?? {})

    const hasUnsavedChanges = providersRevision > 0 || toolsDirty || compressionDirty || mcpDirty

    return (
        <div className="grid gap-4">
            <div className="space-y-2 select-none">
                <h4 className="font-medium leading-none space-x-2 text-gray-900 dark:text-gray-100">
                    <span>@i</span>
                    <Badge variant="secondary" className='bg-slate-100 dark:bg-slate-800 text-gray-800 dark:text-gray-200'>{appVersion}</Badge>
                </h4>
                <p className="text-sm text-muted-foreground dark:text-gray-400">Customize @i to fit your workflow</p>
            </div>
            <Tabs value={activeTab} onValueChange={setActiveTab} defaultValue="provider-list">
                <div className="flex items-center justify-between mb-2">
                    <AnimatedTabsList
                        tabs={preferenceTabs}
                        value={activeTab}
                        tabsListClassName="h-10 shadow-xs border border-gray-200/50 dark:border-gray-700/50"
                    />
                    <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-linear-to-br from-gray-50 to-gray-100/50 dark:from-gray-800/40 dark:to-gray-900/40 border border-gray-200/60 dark:border-gray-700/60 backdrop-blur-xs">
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

                <TabsContent value="provider-list">
                    <ProvidersManager />
                </TabsContent>

                <TabsContent value="tool">
                    <ToolsManager
                        maxWebSearchItems={maxWebSearchItems}
                        setMaxWebSearchItems={setMaxWebSearchItems}
                        memoryEnabled={memoryEnabled}
                        setMemoryEnabled={setMemoryEnabled}
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

                <TabsContent value="mcp-server" className='w-[700px] h-[600px] focus:ring-0 focus-visible:ring-0'>
                    <div className="w-full h-full bg-gray-50 dark:bg-gray-900 p-2 rounded-md">
                        <div className="w-full h-full bg-white dark:bg-gray-800 rounded-lg shadow-xs border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
                            <MCPServersManagerContent
                                mcpServerConfig={mcpServerConfig}
                                setMcpServerConfig={setMcpServerConfig}
                            />
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="skills">
                    <SkillsManager />
                </TabsContent>
            </Tabs>
        </div>
    )
}

export default PreferenceComponent

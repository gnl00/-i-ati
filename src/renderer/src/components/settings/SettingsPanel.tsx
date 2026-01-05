import { AnimatedTabsList } from '@renderer/components/ui/animated-tabs'
import { Tabs, TabsContent } from "@renderer/components/ui/tabs"
import React, { useEffect, useState } from 'react'

import { Badge } from '@renderer/components/ui/badge'
import { Button } from "@renderer/components/ui/button"
import { useChatStore } from '@renderer/store'
import { useAppConfigStore } from '@renderer/store/appConfig'
import { Plug, Server, Wrench } from "lucide-react"
import { toast } from 'sonner'

import { MCPServersManagerContent } from './MCPServersManager'
import ProvidersManager from './ProvidersManager'
import ToolsManager from './ToolsManager'

interface PreferenceProps { }

const PreferenceComponent: React.FC<PreferenceProps> = () => {
    const { appVersion } = useChatStore()

    const {
        appConfig,
        setAppConfig,
        providers,
        titleGenerateModel,
        titleGenerateEnabled,
        mcpServerConfig,
        setMcpServerConfig,
    } = useAppConfigStore()

    const [maxWebSearchItems, setMaxWebSearchItems] = useState<number>(appConfig?.tools?.maxWebSearchItems || 3)
    const [msConfig, setmsConfig] = useState<string>(JSON.stringify(mcpServerConfig, null, 2))
    const [activeTab, setActiveTab] = useState<string>('provider-list')

    useEffect(() => {
        setmsConfig(JSON.stringify(mcpServerConfig, null, 2))
    }, [mcpServerConfig])

    useEffect(() => {
        if (appConfig?.tools?.maxWebSearchItems !== undefined) {
            setMaxWebSearchItems(appConfig.tools.maxWebSearchItems)
        }
    }, [appConfig])

    const saveConfigurationClick = (): void => {
        const updatedAppConfig = {
            ...appConfig,
            providers: providers,
            tools: {
                ...appConfig.tools,
                titleGenerateModel: titleGenerateModel,
                titleGenerateEnabled: titleGenerateEnabled,
                maxWebSearchItems: maxWebSearchItems
            },
            mcp: {
                ...JSON.parse(msConfig)
            }
        }

        setAppConfig(updatedAppConfig)
        toast.success('Save configurations success')
    }

    const onMcpServerConfigChange = (e: any) => {
        try {
            const config = e.target.value
            setmsConfig(config)
            setMcpServerConfig(JSON.parse(config))
            toast.success('All syntax right.')
        } catch (error: any) {
            toast.error(error.message)
        }
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
        }
    ]

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
                        tabsListClassName="h-10 shadow-sm border border-gray-200/50 dark:border-gray-700/50"
                    />
                    <div className="flex items-end gap-2">
                        <p className='text-xs text-orange-400 dark:text-orange-300 select-none'>Remember to save changes</p>
                        <Button size="xs" onClick={saveConfigurationClick} className="shadow-sm">
                            <i className="ri-save-line mr-1.5"></i>
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
                    />
                </TabsContent>

                <TabsContent value="mcp-server" className='w-[700px] h-[600px] focus:ring-0 focus-visible:ring-0'>
                    <div className="w-full h-full bg-gray-50 dark:bg-gray-900 p-2 rounded-md">
                        <div className="w-full h-full bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
                            <MCPServersManagerContent
                                mcpServerConfig={mcpServerConfig}
                                setMcpServerConfig={setMcpServerConfig}
                            />
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    )
}

export default PreferenceComponent

import React from 'react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import InlineDeleteConfirm from './common/InlineDeleteConfirm'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
import { invokeSelectDirectory } from '@renderer/invoker/ipcInvoker'
import { builtInPluginRegistry } from '@shared/plugins/requestAdapters'
import { toast } from 'sonner'

interface PluginsManagerProps {
  plugins: PluginEntity[]
  setPlugins: (plugins: PluginEntity[]) => void
  refreshPlugins: () => Promise<void>
  importLocalPlugin: (sourceDir: string) => Promise<void>
  uninstallLocalPlugin: (pluginId: string) => Promise<void>
}

const PluginsManager: React.FC<PluginsManagerProps> = ({
  plugins,
  setPlugins,
  refreshPlugins,
  importLocalPlugin,
  uninstallLocalPlugin
}) => {
  const localPlugins = React.useMemo(
    () => plugins.filter(plugin => plugin.source === 'local'),
    [plugins]
  )
  const activeCount = localPlugins.filter(plugin => plugin.enabled).length
  const builtInAdapters = React.useMemo(
    () => builtInPluginRegistry.listRequestAdapterPlugins(),
    []
  )
  const [isRefreshing, setIsRefreshing] = React.useState(false)
  const [isImporting, setIsImporting] = React.useState(false)

  const handleToggle = (pluginId: string, enabled: boolean): void => {
    setPlugins(
      plugins.map(plugin => {
        if (plugin.pluginId !== pluginId) {
          return plugin
        }
        return { ...plugin, enabled }
      })
    )
  }

  const handleRefresh = async (): Promise<void> => {
    if (isRefreshing) {
      return
    }

    try {
      setIsRefreshing(true)
      await refreshPlugins()
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleImport = async (): Promise<void> => {
    if (isImporting) {
      return
    }

    const result = await invokeSelectDirectory()
    if (!result.success || !result.path) {
      return
    }

    try {
      setIsImporting(true)
      await importLocalPlugin(result.path)
      toast.success('Local plugin imported')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      toast.error(message || 'Failed to import local plugin')
    } finally {
      setIsImporting(false)
    }
  }

  const handleUninstall = async (plugin: PluginEntity): Promise<void> => {
    if (plugin.source !== 'local') {
      return
    }

    try {
      await uninstallLocalPlugin(plugin.pluginId)
      toast.success('Local plugin uninstalled')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      toast.error(message || 'Failed to uninstall local plugin')
    }
  }

  return (
    <div className='w-[700px] h-[600px] focus:ring-0 focus-visible:ring-0'>
      <div className='w-full h-full space-y-2 p-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent hover:scrollbar-thumb-gray-400 dark:hover:scrollbar-thumb-gray-500'>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs overflow-hidden">
          <div className="px-4 py-4 border-b border-gray-100 dark:border-gray-700/50">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1.5 w-full">
                <div className="w-full flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                  <Label className="text-[13.5px] font-semibold text-gray-900 dark:text-gray-100 tracking-tight cursor-default">
                    Plugins
                  </Label>
                  <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-gray-500 border-gray-200 bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700">
                    {localPlugins.length} local
                  </Badge>
                  {activeCount > 0 && (
                    <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800">
                      {activeCount} active
                    </Badge>
                  )}
                  </div>
                                  <div className="flex items-center gap-2">
                  <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => void handleRefresh()}
                      disabled={isRefreshing}
                      className="h-8 px-3 text-[11px]"
                    >
                    {isRefreshing ? <i className='ri-refresh-line animate-spin'></i> : <i className='ri-refresh-line'></i>}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void handleImport()}
                    disabled={isImporting}
                    className="h-7 px-3 text-[11px]"
                  >
                    {isImporting ? 'Importing...' : 'Import Local Plugin'}
                  </Button>
                </div>
                </div>
                <p className="text-[12px] text-gray-400 dark:text-gray-500 leading-relaxed">
                  Built-in adapters are app capabilities. This page is mainly for importing and managing local plugins.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gray-50/40 dark:bg-gray-900/30">
            <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800/70 bg-white/50 dark:bg-gray-900/10">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-medium text-gray-700 dark:text-gray-300">Local Plugins</span>
                <Badge variant="outline" className="text-[9.5px] h-[18px] px-1.5 text-gray-400 border-gray-200/80 bg-transparent dark:text-gray-500 dark:border-gray-700 font-normal">
                  external
                </Badge>
              </div>
              <p className="mt-1 text-[11.5px] text-gray-400 dark:text-gray-500 leading-relaxed">
                Import custom plugins from a local folder. Only local plugins can be enabled, disabled, or uninstalled here.
              </p>
            </div>

            <div className="divide-y divide-gray-100 dark:divide-gray-800/70">
              {localPlugins.length === 0 && (
                <div className="px-5 py-8 text-center">
                  <p className="text-[12px] text-gray-400 dark:text-gray-500">No local plugins installed.</p>
                </div>
              )}

              {localPlugins.map((plugin) => {
                const requestAdapterCapabilities = plugin.capabilities
                  .filter(capability => capability.kind === 'request-adapter')
                  .map(capability => capability.data ?? {})

                return (
                  <div
                    key={plugin.pluginId}
                    className="group flex items-start justify-between gap-4 px-5 py-4 hover:bg-white/70 dark:hover:bg-gray-800/40 transition-colors duration-150"
                  >
                    <div className="flex-1 space-y-2 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[13px] font-medium text-gray-900 dark:text-gray-100 tracking-tight">{plugin.name}</span>
                        {plugin.enabled && (
                          <Badge variant="secondary" className="text-[9.5px] h-[18px] px-1.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-0">
                            Active
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[9.5px] h-[18px] px-1.5 text-gray-400 border-gray-200/80 bg-transparent dark:text-gray-500 dark:border-gray-700 font-normal">
                          local
                        </Badge>
                        {requestAdapterCapabilities.length > 0 && (
                          <Badge variant="outline" className="text-[9.5px] h-[18px] px-1.5 text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:text-blue-300 dark:border-blue-900/50 font-normal">
                            request-adapter
                          </Badge>
                        )}
                        {plugin.version && (
                          <Badge variant="outline" className="text-[9.5px] h-[18px] px-1.5 text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:text-emerald-300 dark:border-emerald-900/50 font-normal">
                            v{plugin.version}
                          </Badge>
                        )}
                        {plugin.status !== 'installed' && (
                          <Badge variant="outline" className="text-[9.5px] h-[18px] px-1.5 text-rose-500 border-rose-200 bg-rose-50 dark:bg-rose-950/20 dark:text-rose-300 dark:border-rose-900/50 font-normal">
                            {plugin.status}
                          </Badge>
                        )}
                      </div>

                      {plugin.description && (
                        <p className="text-[11.5px] text-gray-500 dark:text-gray-400 leading-relaxed">{plugin.description}</p>
                      )}

                      {plugin.lastError && (
                        <p className="text-[11px] text-rose-500 dark:text-rose-400 leading-relaxed">
                          {plugin.lastError}
                        </p>
                      )}

                      <p className="font-mono text-[10px] text-gray-400/60 dark:text-gray-600 tracking-tight">{plugin.pluginId}</p>
                    </div>

                    <div className="flex items-center gap-2 pt-0.5 shrink-0">
                      <InlineDeleteConfirm
                        onConfirm={() => handleUninstall(plugin)}
                        ariaLabel="Uninstall plugin"
                        revealOnGroupHover
                      />
                      <Switch
                        checked={plugin.enabled}
                        onCheckedChange={(checked) => handleToggle(plugin.pluginId, checked)}
                        className="data-[state=checked]:bg-amber-500 scale-90 origin-center"
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="px-5 py-3 border-y border-gray-100 dark:border-gray-800/70 bg-white/50 dark:bg-gray-900/10">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-medium text-gray-700 dark:text-gray-300">Built-in Adapters</span>
                <Badge variant="outline" className="text-[9.5px] h-[18px] px-1.5 text-gray-400 border-gray-200/80 bg-transparent dark:text-gray-500 dark:border-gray-700 font-normal">
                  built-in
                </Badge>
              </div>
              <p className="mt-1 text-[11.5px] text-gray-400 dark:text-gray-500 leading-relaxed">
                These adapters ship with the app and are selected from Provider settings, not installed as plugins.
              </p>
            </div>

            <div className="divide-y divide-gray-100 dark:divide-gray-800/70">
              {builtInAdapters.map((definition) => {
                const capability = definition.capabilities.find(
                  item => item.kind === 'request-adapter'
                )

                return (
                  <div
                    key={definition.id}
                    className="flex items-start justify-between gap-4 px-5 py-4"
                  >
                    <div className="flex-1 space-y-2 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[13px] font-medium text-gray-900 dark:text-gray-100 tracking-tight">{definition.name}</span>
                        <Badge variant="outline" className="text-[9.5px] h-[18px] px-1.5 text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:text-blue-300 dark:border-blue-900/50 font-normal">
                          request-adapter
                        </Badge>
                        {capability?.kind === 'request-adapter' && (
                          <>
                            <Badge variant="outline" className="text-[9.5px] h-[18px] px-1.5 text-gray-500 border-gray-200/80 bg-transparent dark:text-gray-400 dark:border-gray-700 font-normal">
                              {capability.providerType}
                            </Badge>
                            <Badge variant="outline" className="text-[9.5px] h-[18px] px-1.5 text-gray-500 border-gray-200/80 bg-transparent dark:text-gray-400 dark:border-gray-700 font-normal">
                              {capability.modelTypes.join(', ')}
                            </Badge>
                          </>
                        )}
                      </div>
                      <p className="text-[11.5px] text-gray-500 dark:text-gray-400 leading-relaxed">{definition.description}</p>
                      <p className="font-mono text-[10px] text-gray-400/60 dark:text-gray-600 tracking-tight">{definition.id}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PluginsManager

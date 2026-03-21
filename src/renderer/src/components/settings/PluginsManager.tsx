import React from 'react'
import type { RemotePluginCatalogItem } from '@shared/plugins/remoteRegistry'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import InlineDeleteConfirm from './common/InlineDeleteConfirm'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
import { invokeSelectDirectory } from '@renderer/invoker/ipcInvoker'
import { toast } from 'sonner'

interface PluginsManagerProps {
  plugins: PluginEntity[]
  remotePlugins: RemotePluginCatalogItem[]
  setPlugins: (plugins: PluginEntity[]) => void
  refreshPlugins: () => Promise<void>
  refreshRemotePlugins: () => Promise<void>
  installRemotePlugin: (pluginId: string) => Promise<void>
  importLocalPlugin: (sourceDir: string) => Promise<void>
  uninstallLocalPlugin: (pluginId: string) => Promise<void>
}

const PluginsManager: React.FC<PluginsManagerProps> = ({
  plugins,
  remotePlugins,
  setPlugins,
  refreshPlugins,
  refreshRemotePlugins,
  installRemotePlugin,
  importLocalPlugin,
  uninstallLocalPlugin
}) => {
  const compareVersions = React.useCallback((left?: string, right?: string): number => {
    if (!left && !right) return 0
    if (!left) return -1
    if (!right) return 1

    const leftParts = left.split('.').map(part => Number.parseInt(part, 10) || 0)
    const rightParts = right.split('.').map(part => Number.parseInt(part, 10) || 0)
    const length = Math.max(leftParts.length, rightParts.length)

    for (let index = 0; index < length; index += 1) {
      const leftValue = leftParts[index] ?? 0
      const rightValue = rightParts[index] ?? 0
      if (leftValue > rightValue) return 1
      if (leftValue < rightValue) return -1
    }

    return 0
  }, [])

  const installedPlugins = React.useMemo(
    () => plugins.filter(plugin => plugin.source !== 'built-in'),
    [plugins]
  )
  const activeCount = installedPlugins.filter(plugin => plugin.enabled).length
  const [isRefreshing, setIsRefreshing] = React.useState(false)
  const [isRefreshingRemote, setIsRefreshingRemote] = React.useState(false)
  const [isImporting, setIsImporting] = React.useState(false)
  const [installingRemotePluginId, setInstallingRemotePluginId] = React.useState<string | null>(null)

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

  const handleRefreshRemote = async (): Promise<void> => {
    if (isRefreshingRemote) {
      return
    }

    try {
      setIsRefreshingRemote(true)
      await refreshRemotePlugins()
    } finally {
      setIsRefreshingRemote(false)
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
    if (plugin.source === 'built-in') {
      return
    }

    try {
      await uninstallLocalPlugin(plugin.pluginId)
      toast.success('Plugin uninstalled')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      toast.error(message || 'Failed to uninstall local plugin')
    }
  }

  const handleRemoteInstall = async (plugin: RemotePluginCatalogItem): Promise<void> => {
    if (installingRemotePluginId) {
      return
    }

    try {
      setInstallingRemotePluginId(plugin.pluginId)
      await installRemotePlugin(plugin.pluginId)
      toast.success('Remote plugin installed')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      toast.error(message || 'Failed to install remote plugin')
    } finally {
      setInstallingRemotePluginId(null)
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
                    {installedPlugins.length} installed
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
            <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800/70 bg-gray-100 dark:bg-gray-900/10">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-semibold tracking-wide text-gray-700 dark:text-gray-300">Installed Plugins</span>
                <Badge variant="outline" className="text-[9.5px] h-[18px] px-1.5 text-gray-400 border-gray-200/80 bg-transparent dark:text-gray-500 dark:border-gray-700 font-normal">
                  external
                </Badge>
              </div>
              <p className="mt-1 text-[11.5px] text-gray-400 dark:text-gray-500 leading-relaxed">
                Plugins installed from local folders or the official remote registry. Built-in adapters are managed separately.
              </p>
            </div>

            <div className="divide-y divide-gray-100 dark:divide-gray-800/70">
              {installedPlugins.length === 0 && (
                <div className="px-5 py-8 text-center">
                  <p className="text-[12px] text-gray-400 dark:text-gray-500">No installed plugins yet.</p>
                </div>
              )}

              {installedPlugins.map((plugin) => {
                const remotePlugin = remotePlugins.find(item => item.pluginId === plugin.pluginId)
                const hasRemoteUpdate = plugin.source === 'remote'
                  && remotePlugin
                  && compareVersions(remotePlugin.version, plugin.version) > 0
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
                          {plugin.source}
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
                        {hasRemoteUpdate && (
                          <Badge variant="outline" className="text-[9.5px] h-[18px] px-1.5 text-violet-600 border-violet-200 bg-violet-50 dark:bg-violet-950/20 dark:text-violet-300 dark:border-violet-900/50 font-normal">
                            Update available
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

            <div className="px-5 py-3 border-y border-gray-100 dark:border-gray-800/70 bg-gray-100 dark:bg-gray-900/10">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-semibold tracking-wide text-gray-700 dark:text-gray-300">Remote Plugins</span>
                    <Badge variant="outline" className="text-[9.5px] h-[18px] px-1.5 text-gray-400 border-gray-200/80 bg-transparent dark:text-gray-500 dark:border-gray-700 font-normal">
                      registry
                    </Badge>
                    <Badge variant="outline" className="text-[9.5px] h-[18px] px-1.5 font-normal text-gray-500 border-gray-200 bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700">
                      {remotePlugins.length} available
                    </Badge>
                  </div>
                  <p className="mt-1 text-[11.5px] text-gray-400 dark:text-gray-500 leading-relaxed">
                    Official remote catalog from the atiapp plugins registry.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void handleRefreshRemote()}
                  disabled={isRefreshingRemote}
                  className="h-8 px-3 text-[11px]"
                >
                  {isRefreshingRemote ? <i className='ri-refresh-line animate-spin'></i> : <i className='ri-refresh-line'></i>}
                </Button>
              </div>
            </div>

            <div className="divide-y divide-gray-100 dark:divide-gray-800/70">
              {remotePlugins.length === 0 && (
                <div className="px-5 py-8 text-center">
                  <p className="text-[12px] text-gray-400 dark:text-gray-500">No remote plugins available.</p>
                </div>
              )}

              {remotePlugins.map((plugin) => {
                const installedPlugin = plugins.find(item => item.pluginId === plugin.pluginId)
                const hasUpdateAvailable = installedPlugin?.source === 'remote'
                  && compareVersions(plugin.version, installedPlugin.version) > 0
                const requestAdapterCapabilities = plugin.capabilities
                  .filter(capability => capability.kind === 'request-adapter')

                return (
                  <div
                    key={plugin.pluginId}
                    className="flex items-start justify-between gap-4 px-5 py-4"
                  >
                    <div className="flex-1 space-y-2 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[13px] font-medium text-gray-900 dark:text-gray-100 tracking-tight">{plugin.name}</span>
                        <Badge variant="outline" className="text-[9.5px] h-[18px] px-1.5 text-violet-600 border-violet-200 bg-violet-50 dark:bg-violet-950/20 dark:text-violet-300 dark:border-violet-900/50 font-normal">
                          remote
                        </Badge>
                        {requestAdapterCapabilities.length > 0 && (
                          <Badge variant="outline" className="text-[9.5px] h-[18px] px-1.5 text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:text-blue-300 dark:border-blue-900/50 font-normal">
                            request-adapter
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[9.5px] h-[18px] px-1.5 text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:text-emerald-300 dark:border-emerald-900/50 font-normal">
                          v{plugin.version}
                        </Badge>
                        {hasUpdateAvailable ? (
                          <Badge variant="outline" className="text-[9.5px] h-[18px] px-1.5 text-violet-600 border-violet-200 bg-violet-50 dark:bg-violet-950/20 dark:text-violet-300 dark:border-violet-900/50 font-normal">
                            Update available
                          </Badge>
                        ) : installedPlugin ? (
                          <Badge variant="secondary" className="text-[9.5px] h-[18px] px-1.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-0">
                            Installed
                          </Badge>
                        ) : null}
                      </div>

                      {plugin.description && (
                        <p className="text-[11.5px] text-gray-500 dark:text-gray-400 leading-relaxed">{plugin.description}</p>
                      )}

                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-mono text-[10px] text-gray-400/60 dark:text-gray-600 tracking-tight">{plugin.pluginId}</p>
                      </div>
                    </div>

                    <div className="pt-0.5 shrink-0">
                      <Button
                        type="button"
                        size="sm"
                        variant={hasUpdateAvailable ? 'default' : installedPlugin ? 'ghost' : 'outline'}
                        disabled={(Boolean(installedPlugin) && !hasUpdateAvailable) || installingRemotePluginId === plugin.pluginId}
                        onClick={() => void handleRemoteInstall(plugin)}
                        className="h-7 px-3 text-[11px]"
                      >
                        {installingRemotePluginId === plugin.pluginId
                          ? 'Installing...'
                          : hasUpdateAvailable
                            ? 'Update'
                            : installedPlugin
                            ? 'Installed'
                            : 'Install'}
                      </Button>
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

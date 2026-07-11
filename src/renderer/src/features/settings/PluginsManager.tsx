import React from 'react'
import type { RemotePluginCatalogItem } from '@shared/plugins/remoteRegistry'
import { Badge } from '@renderer/shared/components/ui/badge'
import InlineDeleteConfirm from './common/InlineDeleteConfirm'
import { Label } from '@renderer/shared/components/ui/label'
import { Switch } from '@renderer/shared/components/ui/switch'
import { invokeSelectDirectory } from '@renderer/infrastructure/ipc'
import { cn } from '@renderer/shared/lib/utils'
import { Download, FolderInput, PackageOpen, Puzzle, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import {
  SettingsEmptyState,
  SettingsList,
  SettingsListItem,
  SettingsLoadingState,
  SettingsPageShell,
  SettingsSectionHeader,
  SettingsSubsectionHeader,
  settingsOutlineButtonClassName,
  settingsPrimaryButtonClassName
} from './common/SettingsLayout'

interface PluginsManagerProps {
  plugins: PluginEntity[]
  remotePlugins: RemotePluginCatalogItem[]
  pluginsLoaded: boolean
  remotePluginsLoaded: boolean
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
  pluginsLoaded,
  remotePluginsLoaded,
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
  const visibleRemotePlugins = remotePlugins
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

  const handleRefreshRemote = React.useCallback(async (): Promise<void> => {
    if (isRefreshingRemote) {
      return
    }

    try {
      setIsRefreshingRemote(true)
      await refreshRemotePlugins()
    } finally {
      setIsRefreshingRemote(false)
    }
  }, [isRefreshingRemote, refreshRemotePlugins])

  React.useEffect(() => {
    if (remotePluginsLoaded || isRefreshingRemote) {
      return
    }

    void handleRefreshRemote()
  }, [handleRefreshRemote, remotePluginsLoaded, isRefreshingRemote])

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

  const handleRemoteInstall = async (
    plugin: RemotePluginCatalogItem,
    mode: 'install' | 'upgrade'
  ): Promise<void> => {
    if (installingRemotePluginId) {
      return
    }

    try {
      setInstallingRemotePluginId(plugin.pluginId)
      await installRemotePlugin(plugin.pluginId)
      toast.success(mode === 'upgrade' ? 'Remote plugin upgraded' : 'Remote plugin installed')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      toast.error(message || (mode === 'upgrade' ? 'Failed to upgrade remote plugin' : 'Failed to install remote plugin'))
    } finally {
      setInstallingRemotePluginId(null)
    }
  }

  return (
    <SettingsPageShell>
      <SettingsSectionHeader
        title={<Label className="cursor-default">Plugins</Label>}
        badges={(
          <>
            <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-gray-500 border-gray-200 bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700">
              {pluginsLoaded ? `${installedPlugins.length} installed` : 'Loading...'}
            </Badge>
            {activeCount > 0 && (
              <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800">
                {activeCount} active
              </Badge>
            )}
          </>
        )}
        description="Built-in adapters are app capabilities. This page is mainly for importing and managing local plugins."
        actions={(
          <>
            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={isRefreshing}
              className={settingsOutlineButtonClassName}
            >
              <RefreshCw className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin')} />
              {isRefreshing ? 'Refreshing...' : 'Refresh Installed'}
            </button>
            <button
              type="button"
              onClick={() => void handleImport()}
              disabled={isImporting}
              className={settingsPrimaryButtonClassName}
            >
              <FolderInput className="w-3.5 h-3.5" />
              {isImporting ? 'Importing...' : 'Import Local'}
            </button>
          </>
        )}
        className="border-b border-gray-100 dark:border-gray-700/50"
      />

      <SettingsSubsectionHeader
        title="Installed Plugins"
        badges={(
          <Badge variant="outline" className="text-[9.5px] h-[18px] px-1.5 text-gray-400 border-gray-200/80 bg-transparent dark:text-gray-500 dark:border-gray-700 font-normal">
            external
          </Badge>
        )}
        description="Plugins installed from local folders or the official remote registry. Built-in adapters are managed separately."
        className="border-t-0"
      />

      <SettingsList className="flex-none max-h-[220px]">
        {installedPlugins.length === 0 && (
          pluginsLoaded ? (
            <SettingsEmptyState
              icon={<Puzzle className="w-4 h-4 text-gray-400 dark:text-gray-500" />}
              title="No installed plugins yet"
              description="Import a local plugin or install one from the registry."
              className="py-8"
            />
          ) : (
            <SettingsLoadingState className="py-8">
              Loading installed plugins...
            </SettingsLoadingState>
          )
        )}

        {installedPlugins.map((plugin) => {
          const remotePlugin = remotePlugins.find(item => item.pluginId === plugin.pluginId)
          const hasRemoteUpdate = remotePlugin
            && compareVersions(remotePlugin.version, plugin.version) > 0
          const payloadExtensionCapabilities = plugin.capabilities
            .filter(capability => capability.kind === 'request-payload-extension')
            .map(capability => capability.data ?? {})

          return (
            <SettingsListItem key={plugin.pluginId} className="px-4 py-4">
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
                  {payloadExtensionCapabilities.length > 0 && (
                    <Badge variant="outline" className="text-[9.5px] h-[18px] px-1.5 text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:text-blue-300 dark:border-blue-900/50 font-normal">
                      payload-extension
                    </Badge>
                  )}
                  {plugin.version && (
                    <Badge variant="outline" className="text-[9.5px] h-[18px] px-1.5 text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:text-emerald-300 dark:border-emerald-900/50 font-normal">
                      v{plugin.version}
                    </Badge>
                  )}
                  {hasRemoteUpdate && (
                    <Badge variant="outline" className="text-[9.5px] h-[18px] px-1.5 text-sky-600 border-sky-200 bg-sky-50 dark:bg-sky-950/20 dark:text-sky-300 dark:border-sky-900/50 font-normal">
                      Upgrade available
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

                <p className="font-mono text-[10px] text-gray-400/60 dark:text-gray-600 tracking-tight truncate">{plugin.pluginId}</p>
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
            </SettingsListItem>
          )
        })}
      </SettingsList>

      <SettingsSubsectionHeader
        title="Remote Plugins"
        badges={(
          <>
            <Badge variant="outline" className="text-[9.5px] h-[18px] px-1.5 text-gray-400 border-gray-200/80 bg-transparent dark:text-gray-500 dark:border-gray-700 font-normal">
              registry
            </Badge>
            <Badge variant="outline" className="text-[9.5px] h-[18px] px-1.5 font-normal text-gray-500 border-gray-200 bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700">
              {remotePluginsLoaded ? `${visibleRemotePlugins.length} available` : 'Loading...'}
            </Badge>
          </>
        )}
        description="Official remote catalog from the atiapp plugins registry."
        actions={(
          <button
            type="button"
            onClick={() => void handleRefreshRemote()}
            disabled={isRefreshingRemote}
            className={settingsOutlineButtonClassName}
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isRefreshingRemote && 'animate-spin')} />
            {isRefreshingRemote ? 'Refreshing...' : 'Refresh Registry'}
          </button>
        )}
      />

      <SettingsList>
        {visibleRemotePlugins.length === 0 && (
          remotePluginsLoaded ? (
            <SettingsEmptyState
              icon={<PackageOpen className="w-4 h-4 text-gray-400 dark:text-gray-500" />}
              title="No remote plugins available"
              description="Refresh the registry to check for updated catalog data."
              className="py-8"
            />
          ) : (
            <SettingsLoadingState className="py-8">
              Loading registry...
            </SettingsLoadingState>
          )
        )}

        {visibleRemotePlugins.map((plugin) => {
          const installedPlugin = plugins.find(item => item.pluginId === plugin.pluginId)
          const hasUpdateAvailable = installedPlugin
            ? compareVersions(plugin.version, installedPlugin.version) > 0
            : false
          const payloadExtensionCapabilities = plugin.capabilities
            .filter(capability => capability.kind === 'request-payload-extension')

          return (
            <SettingsListItem key={plugin.pluginId} className="px-4 py-4">
              <div className="flex-1 space-y-2 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[13px] font-medium text-gray-900 dark:text-gray-100 tracking-tight">{plugin.name}</span>
                  <Badge variant="outline" className="text-[9.5px] h-[18px] px-1.5 text-violet-600 border-violet-200 bg-violet-50 dark:bg-violet-950/20 dark:text-violet-300 dark:border-violet-900/50 font-normal">
                    remote
                  </Badge>
                  {payloadExtensionCapabilities.length > 0 && (
                    <Badge variant="outline" className="text-[9.5px] h-[18px] px-1.5 text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:text-blue-300 dark:border-blue-900/50 font-normal">
                      payload-extension
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[9.5px] h-[18px] px-1.5 text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:text-emerald-300 dark:border-emerald-900/50 font-normal">
                    v{plugin.version}
                  </Badge>
                  {hasUpdateAvailable ? (
                    <Badge variant="outline" className="text-[9.5px] h-[18px] px-1.5 text-sky-600 border-sky-200 bg-sky-50 dark:bg-sky-950/20 dark:text-sky-300 dark:border-sky-900/50 font-normal">
                      Upgrade available
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

                <p className="font-mono text-[10px] text-gray-400/60 dark:text-gray-600 tracking-tight truncate">{plugin.pluginId}</p>
              </div>

              <div className="pt-0.5 shrink-0">
                <button
                  type="button"
                  disabled={(Boolean(installedPlugin) && !hasUpdateAvailable) || installingRemotePluginId === plugin.pluginId}
                  onClick={() => void handleRemoteInstall(plugin, hasUpdateAvailable ? 'upgrade' : 'install')}
                  className={cn(
                    settingsOutlineButtonClassName,
                    hasUpdateAvailable && 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/20 dark:text-sky-300 dark:hover:bg-sky-950/35'
                  )}
                >
                  <Download className="w-3.5 h-3.5" />
                  {installingRemotePluginId === plugin.pluginId
                    ? hasUpdateAvailable
                      ? 'Upgrading...'
                      : 'Installing...'
                    : hasUpdateAvailable
                      ? 'Upgrade'
                      : installedPlugin
                        ? 'Installed'
                        : 'Install'}
                </button>
              </div>
            </SettingsListItem>
          )
        })}
      </SettingsList>
    </SettingsPageShell>
  )
}

export default PluginsManager

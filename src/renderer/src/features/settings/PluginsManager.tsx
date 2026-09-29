import React from 'react'
import type { RemotePluginCatalogItem } from '@shared/plugins/remoteRegistry'
import InlineDeleteConfirm from './common/InlineDeleteConfirm'
import { Label } from '@renderer/shared/components/ui/label'
import { Switch } from '@renderer/shared/components/ui/switch'
import { invokeSelectDirectory } from '@renderer/infrastructure/ipc'
import { cn } from '@renderer/shared/lib/utils'
import {
  Download,
  FolderInput,
  PackageOpen,
  Puzzle,
  RefreshCw
} from 'lucide-react'
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
  const compareVersions = React.useCallback(
    (left?: string, right?: string): number => {
      if (!left && !right) return 0
      if (!left) return -1
      if (!right) return 1

      const leftParts = left
        .split('.')
        .map((part) => Number.parseInt(part, 10) || 0)
      const rightParts = right
        .split('.')
        .map((part) => Number.parseInt(part, 10) || 0)
      const length = Math.max(leftParts.length, rightParts.length)

      for (let index = 0; index < length; index += 1) {
        const leftValue = leftParts[index] ?? 0
        const rightValue = rightParts[index] ?? 0
        if (leftValue > rightValue) return 1
        if (leftValue < rightValue) return -1
      }

      return 0
    },
    []
  )

  const installedPlugins = React.useMemo(
    () => plugins.filter((plugin) => plugin.source !== 'built-in'),
    [plugins]
  )
  const visibleRemotePlugins = remotePlugins
  const activeCount = installedPlugins.filter((plugin) => plugin.enabled).length
  const [isRefreshing, setIsRefreshing] = React.useState(false)
  const [isRefreshingRemote, setIsRefreshingRemote] = React.useState(false)
  const [isImporting, setIsImporting] = React.useState(false)
  const [installingRemotePluginId, setInstallingRemotePluginId] =
    React.useState<string | null>(null)

  const handleToggle = (pluginId: string, enabled: boolean): void => {
    setPlugins(
      plugins.map((plugin) => {
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
      toast.success(
        mode === 'upgrade'
          ? 'Remote plugin upgraded'
          : 'Remote plugin installed'
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      toast.error(
        message ||
          (mode === 'upgrade'
            ? 'Failed to upgrade remote plugin'
            : 'Failed to install remote plugin')
      )
    } finally {
      setInstallingRemotePluginId(null)
    }
  }

  return (
    <SettingsPageShell>
      <SettingsSectionHeader
        title={<Label className="cursor-default">Plugins</Label>}
        description={
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span>Manage local plugins and discover integrations.</span>
            <span>
              {pluginsLoaded
                ? `${installedPlugins.length} installed · ${activeCount} active`
                : 'Loading...'}
            </span>
          </span>
        }
      />

      <section
        aria-label="Installed plugins"
        className="mx-4 mb-4 flex min-h-0 max-h-[45%] shrink-0 flex-col overflow-hidden rounded-lg border border-gray-100 bg-gray-50/60 dark:border-(--app-border-subtle) dark:bg-(--app-surface-inset)"
      >
        <SettingsSubsectionHeader
          title="Installed Plugins"
          badges={
            <span className="text-[11px] font-normal text-gray-400 dark:text-(--app-text-muted)">
              {installedPlugins.length} plugins
            </span>
          }
          actions={
            <>
              <button
                type="button"
                onClick={() => void handleRefresh()}
                disabled={isRefreshing}
                className={settingsOutlineButtonClassName}
              >
                <RefreshCw
                  className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin')}
                />
                {isRefreshing ? 'Refreshing...' : 'Refresh'}
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
          }
          className="flex-wrap items-center border-t-0 bg-transparent px-3 dark:bg-transparent [&>div:last-child]:max-w-full"
        />

        <SettingsList className="bg-transparent dark:bg-transparent">
          {installedPlugins.length === 0 &&
            (pluginsLoaded ? (
              <SettingsEmptyState
                icon={
                  <Puzzle className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                }
                title="No installed plugins yet"
                description="Import a local plugin or install one from the registry."
                className="py-8"
              />
            ) : (
              <SettingsLoadingState className="py-8">
                Loading installed plugins...
              </SettingsLoadingState>
            ))}

          {installedPlugins.map((plugin) => {
            const remotePlugin = remotePlugins.find(
              (item) => item.pluginId === plugin.pluginId
            )
            const hasRemoteUpdate =
              remotePlugin &&
              compareVersions(remotePlugin.version, plugin.version) > 0
            const payloadExtensionCapabilities = plugin.capabilities
              .filter(
                (capability) => capability.kind === 'request-payload-extension'
              )
              .map((capability) => capability.data ?? {})

            return (
              <SettingsListItem
                key={plugin.pluginId}
                className="items-center px-3 py-3"
              >
                <div className="flex-1 space-y-1.5 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[13px] font-medium text-gray-900 dark:text-gray-100 tracking-tight">
                      {plugin.name}
                    </span>
                    {plugin.enabled && (
                      <span className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400">
                        Active
                      </span>
                    )}
                    <span className="text-[10px] font-normal text-gray-400 dark:text-(--app-text-muted)">
                      {plugin.source}
                    </span>
                    {payloadExtensionCapabilities.length > 0 && (
                      <span className="text-[10px] font-normal text-gray-400 dark:text-(--app-text-muted)">
                        payload-extension
                      </span>
                    )}
                    {plugin.version && (
                      <span className="text-[10px] font-normal text-gray-400 dark:text-(--app-text-muted)">
                        v{plugin.version}
                      </span>
                    )}
                    {hasRemoteUpdate && (
                      <span className="text-[10px] font-normal text-sky-600 dark:text-sky-400">
                        Upgrade available
                      </span>
                    )}
                    {plugin.status !== 'installed' && (
                      <span className="text-[10px] font-normal text-rose-500 dark:text-rose-400">
                        {plugin.status}
                      </span>
                    )}
                  </div>

                  {plugin.description && (
                    <p className="text-[11.5px] text-gray-500 dark:text-gray-400 leading-relaxed">
                      {plugin.description}
                    </p>
                  )}

                  {plugin.lastError && (
                    <p className="text-[11px] text-rose-500 dark:text-rose-400 leading-relaxed">
                      {plugin.lastError}
                    </p>
                  )}

                  <p
                    title={plugin.pluginId}
                    className="font-mono text-[10px] text-gray-400 dark:text-(--app-text-muted) tracking-tight truncate"
                  >
                    {plugin.pluginId}
                  </p>
                </div>

                <div className="flex w-[66px] shrink-0 flex-col items-center justify-center gap-2">
                  <InlineDeleteConfirm
                    onConfirm={() => handleUninstall(plugin)}
                    ariaLabel="Uninstall plugin"
                    revealOnGroupHover
                  />
                  <Switch
                    checked={plugin.enabled}
                    onCheckedChange={(checked) =>
                      handleToggle(plugin.pluginId, checked)
                    }
                    aria-label={`Enable ${plugin.name}`}
                    className="scale-90 origin-center"
                  />
                </div>
              </SettingsListItem>
            )
          })}
        </SettingsList>
      </section>

      <section
        aria-label="Plugin registry"
        className="mx-4 mb-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-100 bg-gray-50/60 dark:border-(--app-border-subtle) dark:bg-(--app-surface-inset)"
      >
        <SettingsSubsectionHeader
          title="Registry"
          badges={
            <span className="text-[11px] font-normal text-gray-400 dark:text-(--app-text-muted)">
              {remotePluginsLoaded
                ? `${visibleRemotePlugins.length} plugins`
                : 'Loading...'}
            </span>
          }
          actions={
            <button
              type="button"
              onClick={() => void handleRefreshRemote()}
              disabled={isRefreshingRemote}
              className={settingsOutlineButtonClassName}
            >
              <RefreshCw
                className={cn(
                  'w-3.5 h-3.5',
                  isRefreshingRemote && 'animate-spin'
                )}
              />
              {isRefreshingRemote ? 'Refreshing...' : 'Refresh'}
            </button>
          }
          className="flex-wrap items-center border-t-0 bg-transparent px-3 dark:bg-transparent [&>div:last-child]:max-w-full"
        />

        <SettingsList className="bg-transparent dark:bg-transparent">
          {visibleRemotePlugins.length === 0 &&
            (remotePluginsLoaded ? (
              <SettingsEmptyState
                icon={
                  <PackageOpen className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                }
                title="No remote plugins available"
                description="Refresh the registry to check for updated catalog data."
                className="py-8"
              />
            ) : (
              <SettingsLoadingState className="py-8">
                Loading registry...
              </SettingsLoadingState>
            ))}

          {visibleRemotePlugins.map((plugin) => {
            const installedPlugin = plugins.find(
              (item) => item.pluginId === plugin.pluginId
            )
            const hasUpdateAvailable = installedPlugin
              ? compareVersions(plugin.version, installedPlugin.version) > 0
              : false
            const payloadExtensionCapabilities = plugin.capabilities.filter(
              (capability) => capability.kind === 'request-payload-extension'
            )

            return (
              <SettingsListItem
                key={plugin.pluginId}
                className="items-center px-3 py-3"
              >
                <div className="flex-1 space-y-1.5 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[13px] font-medium text-gray-900 dark:text-gray-100 tracking-tight">
                      {plugin.name}
                    </span>
                    <span className="text-[10px] font-normal text-gray-400 dark:text-(--app-text-muted)">
                      remote
                    </span>
                    {payloadExtensionCapabilities.length > 0 && (
                      <span className="text-[10px] font-normal text-gray-400 dark:text-(--app-text-muted)">
                        payload-extension
                      </span>
                    )}
                    <span className="text-[10px] font-normal text-gray-400 dark:text-(--app-text-muted)">
                      v{plugin.version}
                    </span>
                    {hasUpdateAvailable ? (
                      <span className="text-[10px] font-normal text-sky-600 dark:text-sky-400">
                        Upgrade available
                      </span>
                    ) : installedPlugin ? (
                      <span className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400">
                        Installed
                      </span>
                    ) : null}
                  </div>

                  {plugin.description && (
                    <p className="text-[11.5px] text-gray-500 dark:text-gray-400 leading-relaxed">
                      {plugin.description}
                    </p>
                  )}

                  <p
                    title={plugin.pluginId}
                    className="font-mono text-[10px] text-gray-400 dark:text-(--app-text-muted) tracking-tight truncate"
                  >
                    {plugin.pluginId}
                  </p>
                </div>

                <div className="shrink-0">
                  <button
                    type="button"
                    disabled={
                      (Boolean(installedPlugin) && !hasUpdateAvailable) ||
                      installingRemotePluginId === plugin.pluginId
                    }
                    onClick={() =>
                      void handleRemoteInstall(
                        plugin,
                        hasUpdateAvailable ? 'upgrade' : 'install'
                      )
                    }
                    className={cn(
                      settingsOutlineButtonClassName,
                      hasUpdateAvailable &&
                        'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/20 dark:text-sky-300 dark:hover:bg-sky-950/35'
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
      </section>
    </SettingsPageShell>
  )
}

export default PluginsManager

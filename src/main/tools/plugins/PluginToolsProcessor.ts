import { app } from 'electron'
import path from 'path'
import DatabaseService from '@main/db/DatabaseService'
import { LocalPluginCatalogService, pluginEventEmitter } from '@main/services/plugins'

type InstallPluginArgs = {
  source?: string
  chat_uuid?: string
}

type UninstallPluginArgs = {
  pluginId?: string
}

type ListPluginsResponse = {
  success: boolean
  plugins: Array<{
    pluginId: string
    name: string
    source: 'built-in' | 'local' | 'remote'
    enabled: boolean
    version?: string
    status: PluginStatus
    description?: string
    capabilities: string[]
  }>
  message: string
}

type PluginInstallResponse = {
  success: boolean
  plugin?: PluginEntity
  message: string
}

type PluginUninstallResponse = {
  success: boolean
  pluginId?: string
  removed?: boolean
  message: string
}

const resolveSourcePath = (source: string, chatUuid?: string): string => {
  if (path.isAbsolute(source)) {
    return source
  }

  if (chatUuid) {
    const workspacePath = DatabaseService.getWorkspacePathByUuid(chatUuid)
    if (workspacePath) {
      return path.join(workspacePath, source)
    }
  }

  return path.join(app.getPath('userData'), source)
}

export async function processListPlugins(): Promise<ListPluginsResponse> {
  try {
    const plugins = DatabaseService.getPlugins().map((plugin) => ({
      pluginId: plugin.pluginId,
      name: plugin.name,
      source: plugin.source,
      enabled: plugin.enabled,
      version: plugin.version,
      status: plugin.status,
      description: plugin.description,
      capabilities: plugin.capabilities.map((capability) => capability.kind)
    }))

    return {
      success: true,
      plugins,
      message: `Listed ${plugins.length} plugin${plugins.length === 1 ? '' : 's'}.`
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      plugins: [],
      message: `Failed to list plugins: ${message}`
    }
  }
}

export async function processPluginInstall(args: InstallPluginArgs): Promise<PluginInstallResponse> {
  try {
    const source = args.source?.trim()
    if (!source) {
      return {
        success: false,
        message: 'source is required.'
      }
    }

    const resolvedSource = resolveSourcePath(source, args.chat_uuid)
    const catalogService = new LocalPluginCatalogService()
    const manifest = await catalogService.loadPluginManifestFromDirectory(resolvedSource)
    if (manifest.status !== 'installed') {
      return {
        success: false,
        message: manifest.lastError ?? 'Plugin manifest validation failed.'
      }
    }

    const plugins = await DatabaseService.importLocalPluginFromDirectory(resolvedSource)
    pluginEventEmitter.emitPluginsUpdated(plugins)
    const plugin = plugins.find(item => item.pluginId === manifest.pluginId)

    return {
      success: true,
      plugin,
      message: plugin
        ? `Plugin "${plugin.pluginId}" installed successfully.`
        : `Plugin "${manifest.pluginId}" installed successfully.`
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      message: `Failed to install plugin: ${message}`
    }
  }
}

export async function processPluginUninstall(args: UninstallPluginArgs): Promise<PluginUninstallResponse> {
  try {
    const pluginId = args.pluginId?.trim()
    if (!pluginId) {
      return {
        success: false,
        removed: false,
        message: 'pluginId is required.'
      }
    }

    const existing = DatabaseService.getPlugins().find(plugin => plugin.pluginId === pluginId)
    if (!existing) {
      return {
        success: false,
        removed: false,
        pluginId,
        message: `Plugin "${pluginId}" not found.`
      }
    }

    if (existing.source !== 'local') {
      return {
        success: false,
        removed: false,
        pluginId,
        message: `Plugin "${pluginId}" is built-in and cannot be uninstalled.`
      }
    }

    const plugins = await DatabaseService.uninstallLocalPlugin(pluginId)
    pluginEventEmitter.emitPluginsUpdated(plugins)
    return {
      success: true,
      removed: true,
      pluginId,
      message: `Plugin "${pluginId}" uninstalled successfully.`
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      removed: false,
      message: `Failed to uninstall plugin: ${message}`
    }
  }
}

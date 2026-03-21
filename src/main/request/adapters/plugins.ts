import fs from 'fs/promises'
import path from 'path'
import { pathToFileURL } from 'url'
import type { AppPluginManifest } from '@shared/plugins/manifest'
import type { RequestAdapterHooks } from '@shared/plugins/requestAdapterHooks'
import {
  getBuiltInRequestAdapterPlugin,
  getRequestAdapterPluginByIdFromPlugins,
  isBuiltInRequestAdapterPluginEnabled,
  isRequestAdapterPluginEnabledFromPlugins,
  type BuiltInAppPluginId
} from '@shared/plugins/requestAdapters'
import { builtInPluginRegistry } from '@shared/plugins/builtInRegistry'
import type { BaseAdapter } from './base'
import { ClaudeAdapter } from './claude'
import { RequestAdapterPluginWrapper } from './RequestAdapterPluginWrapper'
import { OpenAIAdapter, OpenAIImage1Adapter } from './openai/index'

type RequestAdapterFactory = () => BaseAdapter

type RequestAdapterPluginModule = {
  requestAdapter?: RequestAdapterHooks
  default?: {
    requestAdapter?: RequestAdapterHooks
  }
}

const requestAdapterFactories = new Map<BuiltInAppPluginId, RequestAdapterFactory>([
  ['openai-chat-compatible-adapter', () => new OpenAIAdapter()],
  ['openai-image-compatible-adapter', () => new OpenAIImage1Adapter()],
  ['claude-compatible-adapter', () => new ClaudeAdapter()]
])

export const registerEnabledBuiltInRequestAdapters = (
  enabledPluginIds: Set<string>,
  register: (pluginId: string, adapter: BaseAdapter) => void
): void => {
  builtInPluginRegistry.listCapabilities('request-adapter').forEach(({ plugin }) => {
    if (!enabledPluginIds.has(plugin.id)) {
      return
    }

    const createAdapter = requestAdapterFactories.get(plugin.id)
    if (!createAdapter) {
      console.warn(`[Request] No adapter factories registered for plugin: ${plugin.id}`)
      return
    }

    register(plugin.id, createAdapter())
  })
}

const loadRequestAdapterPluginModule = async (plugin: PluginEntity): Promise<RequestAdapterPluginModule | null> => {
  if (!plugin.manifestPath) {
    console.warn(`[Request] Local plugin missing manifestPath: ${plugin.pluginId}`)
    return null
  }

  const manifest = JSON.parse(await fs.readFile(plugin.manifestPath, 'utf-8')) as AppPluginManifest
  const mainEntry = manifest.entries?.main
  if (!mainEntry) {
    console.warn(`[Request] Local plugin missing entries.main: ${plugin.pluginId}`)
    return null
  }

  const entryPath = path.resolve(path.dirname(plugin.manifestPath), mainEntry)
  const stat = await fs.stat(entryPath)
  const moduleUrl = `${pathToFileURL(entryPath).href}?mtime=${stat.mtimeMs}`
  return await import(moduleUrl) as RequestAdapterPluginModule
}

export const registerEnabledLocalRequestAdapters = async (
  plugins: PluginEntity[],
  register: (pluginId: string, adapter: BaseAdapter) => void
): Promise<void> => {
  const localPlugins = plugins.filter(plugin =>
    (plugin.source === 'local' || plugin.source === 'remote')
    && plugin.enabled
    && plugin.status === 'installed'
    && plugin.capabilities.some(capability => capability.kind === 'request-adapter')
  )

  for (const plugin of localPlugins) {
    try {
      const module = await loadRequestAdapterPluginModule(plugin)
      const requestAdapterHooks = module?.requestAdapter ?? module?.default?.requestAdapter
      if (!requestAdapterHooks) {
        console.warn(`[Request] Local plugin must export a single requestAdapter: ${plugin.pluginId}`)
        continue
      }

      register(plugin.pluginId, new RequestAdapterPluginWrapper(requestAdapterHooks))
    } catch (error) {
      console.warn(`[Request] Failed to load local request adapter plugin: ${plugin.pluginId}`, error)
    }
  }
}

export const getRequestAdapterPluginById = (
  pluginId: string | undefined,
  plugins?: PluginEntity[]
) => {
  return getRequestAdapterPluginByIdFromPlugins(plugins, pluginId)
    ?? getBuiltInRequestAdapterPlugin(pluginId ?? '')
}

export const isRequestAdapterPluginEnabled = (
  pluginConfigs: AppPluginConfig[] | undefined,
  pluginId: string | undefined,
  plugins?: PluginEntity[]
): boolean => {
  if (plugins?.length) {
    return isRequestAdapterPluginEnabledFromPlugins(plugins, pluginId)
  }

  if (!pluginId) {
    return true
  }

  const plugin = getBuiltInRequestAdapterPlugin(pluginId)
  if (!plugin) {
    return true
  }
  return isBuiltInRequestAdapterPluginEnabled(pluginConfigs, plugin.id)
}

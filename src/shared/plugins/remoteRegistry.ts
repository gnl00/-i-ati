import type { PluginCapability } from './types'

export interface RemotePluginRegistryEntry {
  id: string
  path: string
  name: string
  version: string
  description?: string
  manifest: string
  readme?: string
  entries: {
    main: string
  }
  capabilities: PluginCapability[]
}

export interface RemotePluginRegistryDocument {
  repo: string
  ref: string
  plugins: RemotePluginRegistryEntry[]
}

export interface RemotePluginCatalogItem {
  pluginId: string
  path: string
  name: string
  version: string
  description?: string
  manifest: string
  readme?: string
  entries: {
    main: string
  }
  capabilities: PluginCapability[]
  repo: string
  ref: string
}

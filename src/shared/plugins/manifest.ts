import type { PluginCapability } from './types'

export interface AppPluginManifest {
  id: string
  name: string
  version: string
  description?: string
  capabilities: PluginCapability[]
  entries?: {
    main?: string
    renderer?: string
  }
}

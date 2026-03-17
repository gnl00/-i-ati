import { app } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import type { PluginCapability } from '@shared/plugins/types'
import type { AppPluginManifest } from '@shared/plugins/manifest'

export interface ScannedLocalPluginManifest {
  pluginId: string
  displayName: string
  description?: string
  version?: string
  manifestPath: string
  installRoot: string
  status: PluginStatus
  lastError?: string
  capabilities: PluginCapability[]
}

const LOCAL_PLUGINS_DIR = 'plugins'
const PLUGIN_MANIFEST_FILE = 'plugin.json'

export class LocalPluginCatalogService {
  async scanInstalledPlugins(): Promise<ScannedLocalPluginManifest[]> {
    const root = await this.ensurePluginRoot()
    const entries = await fs.readdir(root, { withFileTypes: true })
    const pluginDirs = entries.filter(entry => entry.isDirectory())

    const manifests = await Promise.all(
      pluginDirs.map(async (entry) => await this.readPluginManifest(path.join(root, entry.name), entry.name))
    )

    return manifests.filter((item): item is ScannedLocalPluginManifest => item !== null)
  }

  getPluginRoot(): string {
    return path.join(app.getPath('userData'), LOCAL_PLUGINS_DIR)
  }

  async loadPluginManifestFromDirectory(pluginDir: string): Promise<ScannedLocalPluginManifest> {
    const normalizedDir = path.resolve(pluginDir)
    const fallbackPluginId = path.basename(normalizedDir)
    const manifest = await this.readPluginManifest(normalizedDir, fallbackPluginId)
    if (!manifest) {
      throw new Error('Plugin manifest not found')
    }
    return manifest
  }

  private async ensurePluginRoot(): Promise<string> {
    const root = this.getPluginRoot()
    await fs.mkdir(root, { recursive: true })
    return root
  }

  private async readPluginManifest(pluginDir: string, fallbackPluginId: string): Promise<ScannedLocalPluginManifest | null> {
    const manifestPath = path.join(pluginDir, PLUGIN_MANIFEST_FILE)

    try {
      const manifestContent = await fs.readFile(manifestPath, 'utf-8')
      const rawManifest = JSON.parse(manifestContent) as unknown
      return this.normalizeManifest(rawManifest, manifestPath, pluginDir, fallbackPluginId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        pluginId: fallbackPluginId,
        displayName: fallbackPluginId,
        manifestPath,
        installRoot: pluginDir,
        status: 'invalid',
        lastError: `Invalid plugin manifest: ${message}`,
        capabilities: []
      }
    }
  }

  private normalizeManifest(
    rawManifest: unknown,
    manifestPath: string,
    installRoot: string,
    fallbackPluginId: string
  ): ScannedLocalPluginManifest {
    if (!this.isManifestRecord(rawManifest)) {
      return {
        pluginId: fallbackPluginId,
        displayName: fallbackPluginId,
        manifestPath,
        installRoot,
        status: 'invalid',
        lastError: 'Manifest must be a JSON object',
        capabilities: []
      }
    }

    const manifest = rawManifest as Partial<AppPluginManifest>
    const pluginId = typeof manifest.id === 'string' && manifest.id.trim().length > 0
      ? manifest.id.trim()
      : fallbackPluginId
    const displayName = typeof manifest.name === 'string' && manifest.name.trim().length > 0
      ? manifest.name.trim()
      : pluginId
    const version = typeof manifest.version === 'string' && manifest.version.trim().length > 0
      ? manifest.version.trim()
      : undefined
    const description = typeof manifest.description === 'string' && manifest.description.trim().length > 0
      ? manifest.description.trim()
      : undefined

    const missingFields: string[] = []
    if (typeof manifest.id !== 'string' || manifest.id.trim().length === 0) {
      missingFields.push('id')
    }
    if (typeof manifest.name !== 'string' || manifest.name.trim().length === 0) {
      missingFields.push('name')
    }
    if (typeof manifest.version !== 'string' || manifest.version.trim().length === 0) {
      missingFields.push('version')
    }

    const capabilities = this.parseCapabilities(manifest.capabilities)
    const hasValidCapabilities = Array.isArray(manifest.capabilities)
      && manifest.capabilities.every((capability) => this.isSupportedCapability(capability))
      && capabilities.length > 0
    if (!hasValidCapabilities) {
      missingFields.push('capabilities')
    }

    if (missingFields.length > 0) {
      return {
        pluginId,
        displayName,
        description,
        version,
        manifestPath,
        installRoot,
        status: 'invalid',
        lastError: `Manifest validation failed: ${missingFields.join(', ')}`,
        capabilities
      }
    }

    return {
      pluginId,
      displayName,
      description,
      version,
      manifestPath,
      installRoot,
      status: 'installed',
      capabilities
    }
  }

  private parseCapabilities(rawCapabilities: unknown): PluginCapability[] {
    if (!Array.isArray(rawCapabilities)) {
      return []
    }

    return rawCapabilities.flatMap((capability) => {
      if (!this.isRequestAdapterCapability(capability)) {
        return []
      }

      return [{
        kind: 'request-adapter',
        providerType: capability.providerType,
        modelTypes: capability.modelTypes
      }]
    })
  }

  private isManifestRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }

  private isRequestAdapterCapability(value: unknown): value is Extract<PluginCapability, { kind: 'request-adapter' }> {
    if (!this.isManifestRecord(value) || value.kind !== 'request-adapter') {
      return false
    }

    return typeof value.providerType === 'string'
      && this.isModelTypes(value.modelTypes)
  }

  private isSupportedCapability(value: unknown): boolean {
    return this.isRequestAdapterCapability(value)
  }

  private isModelTypes(value: unknown): value is ModelType[] {
    return Array.isArray(value)
      && value.every((modelType) => modelType === 'llm' || modelType === 'vlm' || modelType === 't2i')
  }
}

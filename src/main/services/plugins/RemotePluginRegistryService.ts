import { net } from 'electron'
import { createLogger } from '@main/services/logging/LogService'
import type {
  RemotePluginCatalogItem,
  RemotePluginRegistryDocument,
  RemotePluginRegistryEntry
} from '@shared/plugins/remoteRegistry'

type FetchLike = typeof fetch

const DEFAULT_REMOTE_PLUGIN_REGISTRY_URL =
  'https://raw.githubusercontent.com/gnl00/atiapp-plugins/main/registry.json'

export class RemotePluginRegistryService {
  private readonly logger = createLogger('RemotePluginRegistryService')
  private readonly effectiveFetch: FetchLike

  constructor(
    fetchImpl?: FetchLike,
    private readonly registryUrl: string = DEFAULT_REMOTE_PLUGIN_REGISTRY_URL
  ) {
    // Prefer Electron's Chromium-backed network stack over undici fetch so
    // remote registry loading follows the same proxy/certificate behavior as
    // the desktop app itself.
    this.effectiveFetch = fetchImpl ?? this.resolveDefaultFetch()
  }

  async listAvailablePlugins(): Promise<RemotePluginCatalogItem[]> {
    this.logger.info('registry.fetch_start', {
      registryUrl: this.registryUrl,
      transport: this.effectiveFetch === fetch ? 'node-fetch' : 'electron-net-fetch'
    })

    const response = await this.effectiveFetch(this.registryUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch remote plugin registry: ${response.status} ${response.statusText}`)
    }

    const rawText = await response.text()
    let parsed: unknown
    try {
      parsed = JSON.parse(rawText)
    } catch (error) {
      throw new Error(`Invalid remote plugin registry JSON: ${error instanceof Error ? error.message : String(error)}`)
    }

    const registry = this.validateRegistry(parsed)
    const items = registry.plugins.map((plugin) => ({
      pluginId: plugin.id,
      path: plugin.path,
      name: plugin.name,
      version: plugin.version,
      description: plugin.description,
      manifest: plugin.manifest,
      readme: plugin.readme,
      entries: {
        main: plugin.entries.main
      },
      capabilities: plugin.capabilities,
      repo: registry.repo,
      ref: registry.ref
    }))

    this.logger.info('registry.fetch_completed', {
      registryUrl: this.registryUrl,
      count: items.length
    })
    return items
  }

  private validateRegistry(value: unknown): RemotePluginRegistryDocument {
    if (!this.isRecord(value)) {
      throw new Error('Remote plugin registry must be a JSON object')
    }

    const repo = this.getRequiredString(value.repo, 'repo')
    const ref = this.getRequiredString(value.ref, 'ref')
    const plugins = value.plugins
    if (!Array.isArray(plugins)) {
      throw new Error('Remote plugin registry field "plugins" must be an array')
    }

    const normalizedPlugins = plugins.map((plugin, index) => this.validatePlugin(plugin, index))
    this.ensureUnique(normalizedPlugins.map(item => item.id), 'plugin id')
    this.ensureUnique(normalizedPlugins.map(item => item.path), 'plugin path')

    return {
      repo,
      ref,
      plugins: normalizedPlugins
    }
  }

  private validatePlugin(value: unknown, index: number): RemotePluginRegistryEntry {
    if (!this.isRecord(value)) {
      throw new Error(`Remote plugin registry entry at index ${index} must be an object`)
    }

    const path = this.getRequiredRelativeString(value.path, `plugins[${index}].path`)
    const manifest = this.getRequiredRelativeString(value.manifest, `plugins[${index}].manifest`)
    const readme = value.readme === undefined
      ? undefined
      : this.getRequiredRelativeString(value.readme, `plugins[${index}].readme`)

    if (!manifest.startsWith(`${path}/`)) {
      throw new Error(`Remote plugin registry entry "${path}" has manifest outside plugin path`)
    }
    if (readme && !readme.startsWith(`${path}/`)) {
      throw new Error(`Remote plugin registry entry "${path}" has readme outside plugin path`)
    }

    const entries = value.entries
    if (!this.isRecord(entries)) {
      throw new Error(`Remote plugin registry entry "${path}" field "entries" must be an object`)
    }

    const main = this.getRequiredRelativeString(entries.main, `plugins[${index}].entries.main`)
    const capabilities = value.capabilities
    if (!Array.isArray(capabilities) || capabilities.length === 0) {
      throw new Error(`Remote plugin registry entry "${path}" must declare non-empty capabilities`)
    }

    return {
      id: this.getRequiredString(value.id, `plugins[${index}].id`),
      path,
      name: this.getRequiredString(value.name, `plugins[${index}].name`),
      version: this.getRequiredString(value.version, `plugins[${index}].version`),
      description: value.description === undefined ? undefined : this.getRequiredString(value.description, `plugins[${index}].description`),
      manifest,
      readme,
      entries: { main },
      capabilities: capabilities as RemotePluginRegistryEntry['capabilities']
    }
  }

  private ensureUnique(values: string[], label: string): void {
    const seen = new Set<string>()
    for (const value of values) {
      if (seen.has(value)) {
        throw new Error(`Duplicate ${label} in remote plugin registry: ${value}`)
      }
      seen.add(value)
    }
  }

  private getRequiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`Remote plugin registry field "${field}" must be a non-empty string`)
    }
    return value.trim()
  }

  private getRequiredRelativeString(value: unknown, field: string): string {
    const normalized = this.getRequiredString(value, field).replace(/\\/g, '/')
    if (normalized.startsWith('/') || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
      throw new Error(`Remote plugin registry field "${field}" must be a safe relative path`)
    }
    return normalized.replace(/^\.\//, '')
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }

  private resolveDefaultFetch(): FetchLike {
    if (typeof net?.fetch === 'function') {
      return net.fetch.bind(net) as FetchLike
    }
    return fetch
  }
}

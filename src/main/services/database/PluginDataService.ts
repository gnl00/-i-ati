import { builtInPluginRegistry } from '@shared/plugins/builtInRegistry'
import type { ConfigRepository } from '@main/db/repositories/ConfigRepository'
import type { PluginCapabilityRepository } from '@main/db/repositories/PluginCapabilityRepository'
import type { PluginRepository } from '@main/db/repositories/PluginRepository'
import type { PluginSettingRepository } from '@main/db/repositories/PluginSettingRepository'
import type { ScannedLocalPluginManifest } from '@main/services/plugins'

type PluginDataServiceDeps = {
  hasDb: () => boolean
  getDb: () => ReturnType<import('@main/db/Database').AppDatabase['getDb']> | null
  getPluginRepo: () => PluginRepository | undefined
  getPluginCapabilityRepo: () => PluginCapabilityRepository | undefined
  getPluginSettingRepo: () => PluginSettingRepository | undefined
  getConfigRepo: () => ConfigRepository | undefined
}

export class PluginDataService {
  constructor(private readonly deps: PluginDataServiceDeps) {}

  getPluginConfigs(): AppPluginConfig[] {
    this.assertDbReady()
    this.migrateLegacyConfigIfNeeded()
    this.ensureBuiltInPlugins()

    const rows = this.requirePluginRepo().getAll()
    return builtInPluginRegistry.normalizeConfigs(rows.map(row => ({
      id: row.plugin_id,
      name: row.display_name,
      description: row.description ?? undefined,
      enabled: row.enabled === 1,
      source: row.source,
      version: row.version ?? undefined,
      manifestPath: row.manifest_path ?? undefined
    })))
  }

  savePluginConfigs(configs: AppPluginConfig[]): void {
    this.assertDbReady()
    this.ensureBuiltInPlugins()

    const pluginRepo = this.requirePluginRepo()
    const db = this.requireDb()
    const normalizedConfigs = builtInPluginRegistry.normalizeConfigs(configs)
    const existingRows = pluginRepo.getAll()
    const now = Date.now()

    const tx = db.transaction(() => {
      normalizedConfigs.forEach((config) => {
        const existing = existingRows.find(row => row.plugin_id === config.id)
        const builtInDefinition = builtInPluginRegistry.getById(config.id)

        pluginRepo.upsert({
          plugin_id: config.id,
          source: builtInDefinition ? 'built-in' : (config.source ?? existing?.source ?? 'local'),
          display_name: builtInDefinition?.name ?? config.name,
          description: builtInDefinition?.description ?? config.description ?? null,
          enabled: config.enabled === false ? 0 : 1,
          version: config.version ?? existing?.version ?? null,
          manifest_path: config.manifestPath ?? existing?.manifest_path ?? null,
          install_root: existing?.install_root ?? null,
          status: existing?.status ?? 'installed',
          last_error: existing?.last_error ?? null,
          created_at: existing?.created_at ?? now,
          updated_at: now
        })
      })
    })

    tx()
    this.ensureBuiltInPluginCapabilities()
  }

  getPlugins(): PluginEntity[] {
    this.assertDbReady()
    this.migrateLegacyConfigIfNeeded()
    this.ensureBuiltInPlugins()

    const pluginRows = this.requirePluginRepo().getAll()
    const capabilityRows = this.requirePluginCapabilityRepo().getAll()

    return pluginRows.map((row) => ({
      pluginId: row.plugin_id,
      name: row.display_name,
      description: row.description ?? undefined,
      source: row.source,
      enabled: row.enabled === 1,
      version: row.version ?? undefined,
      manifestPath: row.manifest_path ?? undefined,
      installRoot: row.install_root ?? undefined,
      status: row.status,
      lastError: row.last_error ?? undefined,
      capabilities: capabilityRows
        .filter(capability => capability.plugin_id === row.plugin_id)
        .map(capability => ({
          kind: capability.capability_kind,
          data: this.parseCapabilityJson(capability.capability_json)
        }))
    }))
  }

  syncLocalPluginManifests(manifests: ScannedLocalPluginManifest[]): PluginEntity[] {
    this.assertDbReady()
    this.migrateLegacyConfigIfNeeded()
    this.ensureBuiltInPlugins()

    const db = this.requireDb()
    const pluginRepo = this.requirePluginRepo()
    const capabilityRepo = this.requirePluginCapabilityRepo()
    const settingRepo = this.requirePluginSettingRepo()
    const now = Date.now()
    const existingRows = pluginRepo.getAll()
    const nextManifestIds = new Set(manifests.map(manifest => manifest.pluginId))

    const tx = db.transaction(() => {
      manifests.forEach((manifest) => {
        const existing = existingRows.find(row => row.plugin_id === manifest.pluginId)

        pluginRepo.upsert({
          plugin_id: manifest.pluginId,
          source: 'local',
          display_name: manifest.displayName,
          description: manifest.description ?? null,
          enabled: existing?.enabled ?? 1,
          version: manifest.version ?? null,
          manifest_path: manifest.manifestPath,
          install_root: manifest.installRoot,
          status: manifest.status,
          last_error: manifest.lastError ?? null,
          created_at: existing?.created_at ?? now,
          updated_at: now
        })

        capabilityRepo.replaceByPluginId(
          manifest.pluginId,
          manifest.capabilities.map((capability) => ({
            plugin_id: manifest.pluginId,
            capability_kind: capability.kind,
            capability_json: JSON.stringify(capability),
            created_at: now,
            updated_at: now
          }))
        )
      })

      existingRows
        .filter(row => row.source === 'local' && !nextManifestIds.has(row.plugin_id))
        .forEach((row) => {
          pluginRepo.deleteById(row.plugin_id)
          capabilityRepo.replaceByPluginId(row.plugin_id, [])
          settingRepo.deleteByPluginId(row.plugin_id)
        })
    })

    tx()
    return this.getPlugins()
  }

  private migrateLegacyConfigIfNeeded(): void {
    const pluginRepo = this.requirePluginRepo()
    if (pluginRepo.countAll() > 0) {
      this.ensureBuiltInPlugins()
      return
    }

    const configRepo = this.deps.getConfigRepo()
    const configRow = configRepo?.getConfig()
    if (!configRow?.value) {
      this.ensureBuiltInPlugins()
      return
    }

    let config: IAppConfig
    try {
      config = JSON.parse(configRow.value) as IAppConfig
    } catch {
      this.ensureBuiltInPlugins()
      return
    }

    const legacyPlugins = config.plugins?.items
    const hasLegacyPlugins = Array.isArray(legacyPlugins) && legacyPlugins.length > 0

    if (!hasLegacyPlugins) {
      this.ensureBuiltInPlugins()
      return
    }

    this.savePluginConfigs(legacyPlugins)

    const { plugins: _legacyPlugins, ...nextConfig } = config
    configRepo?.saveConfig(JSON.stringify(nextConfig), nextConfig.version ?? null)
  }

  private ensureBuiltInPlugins(): void {
    const db = this.requireDb()
    const pluginRepo = this.requirePluginRepo()
    const existingRows = pluginRepo.getAll()
    const now = Date.now()

    const tx = db.transaction(() => {
      builtInPluginRegistry.listAll().forEach((definition) => {
        const existing = existingRows.find(row => row.plugin_id === definition.id)
        pluginRepo.upsert({
          plugin_id: definition.id,
          source: 'built-in',
          display_name: definition.name,
          description: definition.description,
          enabled: existing?.enabled ?? 1,
          version: existing?.version ?? null,
          manifest_path: existing?.manifest_path ?? null,
          install_root: existing?.install_root ?? null,
          status: existing?.status ?? 'installed',
          last_error: existing?.last_error ?? null,
          created_at: existing?.created_at ?? now,
          updated_at: now
        })
      })
    })

    tx()
    this.ensureBuiltInPluginCapabilities()
  }

  private ensureBuiltInPluginCapabilities(): void {
    const db = this.requireDb()
    const capabilityRepo = this.requirePluginCapabilityRepo()
    const now = Date.now()

    const tx = db.transaction(() => {
      builtInPluginRegistry.listAll().forEach((definition) => {
        capabilityRepo.replaceByPluginId(
          definition.id,
          definition.capabilities.map((capability) => ({
            plugin_id: definition.id,
            capability_kind: capability.kind,
            capability_json: JSON.stringify(capability),
            created_at: now,
            updated_at: now
          }))
        )
      })
    })

    tx()
  }

  private parseCapabilityJson(value: string): Record<string, unknown> | undefined {
    try {
      return JSON.parse(value) as Record<string, unknown>
    } catch {
      return undefined
    }
  }

  private assertDbReady(): void {
    if (!this.deps.hasDb()) {
      throw new Error('Database not initialized')
    }
  }

  private requireDb(): ReturnType<import('@main/db/Database').AppDatabase['getDb']> {
    const db = this.deps.getDb()
    if (!db) throw new Error('Database not initialized')
    return db
  }

  private requirePluginRepo(): PluginRepository {
    const repo = this.deps.getPluginRepo()
    if (!repo) throw new Error('Plugin repository not initialized')
    return repo
  }

  private requirePluginCapabilityRepo(): PluginCapabilityRepository {
    const repo = this.deps.getPluginCapabilityRepo()
    if (!repo) throw new Error('Plugin capability repository not initialized')
    return repo
  }

  private requirePluginSettingRepo(): PluginSettingRepository {
    const repo = this.deps.getPluginSettingRepo()
    if (!repo) throw new Error('Plugin setting repository not initialized')
    return repo
  }

}

import { builtInPluginRegistry } from '@shared/plugins/builtInRegistry'
import type { AppPluginSource } from '@shared/plugins/types'
import type { PluginCapabilityDao } from '@main/db/dao/PluginCapabilityDao'
import type { PluginDao } from '@main/db/dao/PluginDao'
import type { PluginSettingDao } from '@main/db/dao/PluginSettingDao'
import type { ScannedLocalPluginManifest } from '@main/services/plugins'

type PluginRepositoryDeps = {
  hasDb: () => boolean
  getDb: () => ReturnType<import('@main/db/core/Database').AppDatabase['getDb']> | null
  getPluginRepo: () => PluginDao | undefined
  getPluginCapabilityRepo: () => PluginCapabilityDao | undefined
  getPluginSettingRepo: () => PluginSettingDao | undefined
}

export class PluginRepository {
  constructor(private readonly deps: PluginRepositoryDeps) {}

  getPluginConfigs(): AppPluginConfig[] {
    this.assertDbReady()

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
  }

  getPlugins(): PluginEntity[] {
    this.assertDbReady()

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
          source: existing?.source === 'remote' ? 'remote' : 'local',
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
        .filter(row => row.source !== 'built-in' && !nextManifestIds.has(row.plugin_id))
        .forEach((row) => {
          pluginRepo.deleteById(row.plugin_id)
          capabilityRepo.replaceByPluginId(row.plugin_id, [])
          settingRepo.deleteByPluginId(row.plugin_id)
        })
    })

    tx()
    return this.getPlugins()
  }

  updatePluginSource(pluginId: string, source: AppPluginSource): PluginEntity[] {
    this.assertDbReady()

    const pluginRepo = this.requirePluginRepo()
    const existing = pluginRepo.getAll().find(row => row.plugin_id === pluginId)
    if (!existing) {
      throw new Error(`Plugin not found: ${pluginId}`)
    }

    pluginRepo.upsert({
      ...existing,
      source,
      updated_at: Date.now()
    })

    return this.getPlugins()
  }

  savePluginSetting(pluginId: string, key: string, value: unknown): void {
    this.assertDbReady()
    this.requirePluginSettingRepo().upsert({
      plugin_id: pluginId,
      key,
      value_json: JSON.stringify(value),
      updated_at: Date.now()
    })
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

  private requireDb(): ReturnType<import('@main/db/core/Database').AppDatabase['getDb']> {
    const db = this.deps.getDb()
    if (!db) throw new Error('Database not initialized')
    return db
  }

  private requirePluginRepo(): PluginDao {
    const repo = this.deps.getPluginRepo()
    if (!repo) throw new Error('Plugin repository not initialized')
    return repo
  }

  private requirePluginCapabilityRepo(): PluginCapabilityDao {
    const repo = this.deps.getPluginCapabilityRepo()
    if (!repo) throw new Error('Plugin capability repository not initialized')
    return repo
  }

  private requirePluginSettingRepo(): PluginSettingDao {
    const repo = this.deps.getPluginSettingRepo()
    if (!repo) throw new Error('Plugin setting repository not initialized')
    return repo
  }
}

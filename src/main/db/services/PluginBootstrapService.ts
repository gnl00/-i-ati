import { builtInPluginRegistry } from '@shared/plugins/builtInRegistry'
import type { ConfigDao } from '@main/db/dao/ConfigDao'
import type { PluginCapabilityDao } from '@main/db/dao/PluginCapabilityDao'
import type { PluginDao } from '@main/db/dao/PluginDao'
import type { PluginRepository } from '@main/db/repositories/PluginRepository'

type PluginBootstrapServiceDeps = {
  getDb: () => ReturnType<import('@main/db/core/Database').AppDatabase['getDb']> | null
  pluginRepository: () => PluginRepository | undefined
  pluginDao: () => PluginDao | undefined
  pluginCapabilityDao: () => PluginCapabilityDao | undefined
  configDao: () => ConfigDao | undefined
}

export class PluginBootstrapService {
  constructor(private readonly deps: PluginBootstrapServiceDeps) {}

  initialize(): void {
    this.migrateLegacyConfigIfNeeded()
    this.ensureBuiltInPlugins()
    this.ensureBuiltInPluginCapabilities()
  }

  private migrateLegacyConfigIfNeeded(): void {
    const pluginDao = this.requirePluginDao()
    if (pluginDao.countAll() > 0) return

    const configDao = this.deps.configDao()
    const configRow = configDao?.getConfig()
    if (!configRow?.value) return

    let config: IAppConfig
    try {
      config = JSON.parse(configRow.value) as IAppConfig
    } catch {
      return
    }

    const legacyPlugins = config.plugins?.items
    const hasLegacyPlugins = Array.isArray(legacyPlugins) && legacyPlugins.length > 0
    if (!hasLegacyPlugins) return

    this.requirePluginRepository().savePluginConfigs(legacyPlugins)

    const { plugins: _legacyPlugins, ...nextConfig } = config
    configDao?.saveConfig(JSON.stringify(nextConfig), nextConfig.version ?? null, Date.now())
  }

  private ensureBuiltInPlugins(): void {
    const db = this.requireDb()
    const pluginDao = this.requirePluginDao()
    const existingRows = pluginDao.getAll()
    const now = Date.now()

    const tx = db.transaction(() => {
      builtInPluginRegistry.listAll().forEach((definition) => {
        const existing = existingRows.find(row => row.plugin_id === definition.id)
        pluginDao.upsert({
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
  }

  private ensureBuiltInPluginCapabilities(): void {
    const db = this.requireDb()
    const capabilityDao = this.requirePluginCapabilityDao()
    const now = Date.now()

    const tx = db.transaction(() => {
      builtInPluginRegistry.listAll().forEach((definition) => {
        capabilityDao.replaceByPluginId(
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

  private requireDb(): ReturnType<import('@main/db/core/Database').AppDatabase['getDb']> {
    const db = this.deps.getDb()
    if (!db) throw new Error('Database not initialized')
    return db
  }

  private requirePluginRepository(): PluginRepository {
    const repository = this.deps.pluginRepository()
    if (!repository) throw new Error('Plugin repository not initialized')
    return repository
  }

  private requirePluginDao(): PluginDao {
    const dao = this.deps.pluginDao()
    if (!dao) throw new Error('Plugin DAO not initialized')
    return dao
  }

  private requirePluginCapabilityDao(): PluginCapabilityDao {
    const dao = this.deps.pluginCapabilityDao()
    if (!dao) throw new Error('Plugin capability DAO not initialized')
    return dao
  }
}

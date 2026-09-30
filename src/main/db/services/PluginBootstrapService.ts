import { builtInPluginRegistry } from '@shared/plugins/builtInRegistry'
import type { PluginCapabilityDao } from '@main/db/dao/PluginCapabilityDao'
import type { PluginDao } from '@main/db/dao/PluginDao'

type PluginBootstrapServiceDeps = {
  getDb: () => ReturnType<import('@main/db/core/Database').AppDatabase['getDb']> | null
  pluginDao: () => PluginDao | undefined
  pluginCapabilityDao: () => PluginCapabilityDao | undefined
}

export class PluginBootstrapService {
  constructor(private readonly deps: PluginBootstrapServiceDeps) {}

  initialize(): void {
    this.ensureBuiltInPlugins()
    this.ensureBuiltInPluginCapabilities()
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

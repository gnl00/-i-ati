import type { PluginCapabilityDao } from '@main/db/dao/PluginCapabilityDao'
import type { PluginDao } from '@main/db/dao/PluginDao'
import type { PluginSettingDao } from '@main/db/dao/PluginSettingDao'
import {
  toPluginCapabilityRows,
  toPluginRowFromManifest
} from '@main/db/mappers/PluginMapper'
import type { PluginRepository } from '@main/db/repositories/PluginRepository'
import type { ScannedLocalPluginManifest } from '@main/services/plugins'

type PluginManifestSyncServiceDeps = {
  hasDb: () => boolean
  getDb: () => ReturnType<import('@main/db/core/Database').AppDatabase['getDb']> | null
  getPluginRepo: () => PluginDao | undefined
  getPluginCapabilityRepo: () => PluginCapabilityDao | undefined
  getPluginSettingRepo: () => PluginSettingDao | undefined
  pluginRepository: () => PluginRepository | undefined
}

export class PluginManifestSyncService {
  constructor(private readonly deps: PluginManifestSyncServiceDeps) {}

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

        pluginRepo.upsert(toPluginRowFromManifest(manifest, now, existing))
        capabilityRepo.replaceByPluginId(
          manifest.pluginId,
          toPluginCapabilityRows(manifest.pluginId, manifest.capabilities, now)
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
    return this.requirePluginRepository().getPlugins()
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

  private requirePluginRepository(): PluginRepository {
    const repository = this.deps.pluginRepository()
    if (!repository) throw new Error('Plugin repository not initialized')
    return repository
  }
}

import { builtInPluginRegistry } from '@shared/plugins/builtInRegistry'
import type { AppPluginSource } from '@shared/plugins/types'
import type { PluginCapabilityDao } from '@main/db/dao/PluginCapabilityDao'
import type { PluginDao } from '@main/db/dao/PluginDao'
import type { PluginSettingDao } from '@main/db/dao/PluginSettingDao'
import {
  toAppPluginConfig,
  toPluginEntity,
  toPluginRowFromConfig,
  toPluginRowWithUpdatedSource,
  toPluginSettingRow
} from '@main/db/mappers/PluginMapper'

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
    return builtInPluginRegistry.normalizeConfigs(rows.map(toAppPluginConfig))
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
        pluginRepo.upsert(toPluginRowFromConfig(config, now, existing))
      })
    })

    tx()
  }

  getPlugins(): PluginEntity[] {
    this.assertDbReady()

    const pluginRows = this.requirePluginRepo().getAll()
    const capabilityRows = this.requirePluginCapabilityRepo().getAll()
    const capabilityRowsByPluginId = new Map<string, typeof capabilityRows>()

    capabilityRows.forEach(row => {
      const rows = capabilityRowsByPluginId.get(row.plugin_id) ?? []
      rows.push(row)
      capabilityRowsByPluginId.set(row.plugin_id, rows)
    })

    return pluginRows.map(row => toPluginEntity(row, capabilityRowsByPluginId.get(row.plugin_id) ?? []))
  }

  updatePluginSource(pluginId: string, source: AppPluginSource): PluginEntity[] {
    this.assertDbReady()

    const pluginRepo = this.requirePluginRepo()
    const existing = pluginRepo.getAll().find(row => row.plugin_id === pluginId)
    if (!existing) {
      throw new Error(`Plugin not found: ${pluginId}`)
    }

    pluginRepo.upsert(toPluginRowWithUpdatedSource(existing, source, Date.now()))

    return this.getPlugins()
  }

  savePluginSetting(pluginId: string, key: string, value: unknown): void {
    this.assertDbReady()
    this.requirePluginSettingRepo().upsert(toPluginSettingRow(pluginId, key, value, Date.now()))
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

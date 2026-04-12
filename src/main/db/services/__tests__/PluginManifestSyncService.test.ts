import { describe, expect, it } from 'vitest'
import { PluginRepository } from '../../repositories/PluginRepository'
import { PluginManifestSyncService } from '../PluginManifestSyncService'

const createTransactionDb = () => ({
  transaction<T extends (...args: any[]) => any>(fn: T) {
    return (...args: Parameters<T>) => fn(...args)
  }
})

const createPluginRepo = (initialRows: any[] = []) => {
  const rows = [...initialRows]
  return {
    rows,
    getAll() {
      return [...rows].sort((a, b) => a.created_at - b.created_at || a.plugin_id.localeCompare(b.plugin_id))
    },
    upsert(row: any) {
      const index = rows.findIndex(item => item.plugin_id === row.plugin_id)
      if (index >= 0) {
        rows[index] = { ...rows[index], ...row }
        return
      }
      rows.push(row)
    },
    deleteById(pluginId: string) {
      const index = rows.findIndex(item => item.plugin_id === pluginId)
      if (index >= 0) {
        rows.splice(index, 1)
      }
    }
  }
}

const createCapabilityRepo = (initialRows: any[] = []) => {
  const rows = [...initialRows]
  return {
    rows,
    getAll() {
      return [...rows]
    },
    replaceByPluginId(pluginId: string, nextRows: any[]) {
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (rows[index].plugin_id === pluginId) {
          rows.splice(index, 1)
        }
      }
      rows.push(...nextRows)
    }
  }
}

const createSettingRepo = () => {
  const deletedPluginIds: string[] = []
  return {
    deletedPluginIds,
    deleteByPluginId(pluginId: string) {
      deletedPluginIds.push(pluginId)
    }
  }
}

describe('PluginManifestSyncService', () => {
  it('syncs local plugin manifests and removes missing local plugins', () => {
    const pluginRepo = createPluginRepo([
      {
        plugin_id: 'local-existing',
        source: 'local',
        display_name: 'Local Existing',
        description: null,
        enabled: 1,
        version: '1.0.0',
        manifest_path: '/plugins/local-existing/plugin.json',
        install_root: '/plugins/local-existing',
        status: 'installed',
        last_error: null,
        created_at: 1,
        updated_at: 1
      }
    ])
    const capabilityRepo = createCapabilityRepo([
      {
        plugin_id: 'local-existing',
        capability_kind: 'request-adapter',
        capability_json: JSON.stringify({
          kind: 'request-adapter',
          providerType: 'openai',
          modelTypes: ['llm']
        }),
        created_at: 1,
        updated_at: 1
      }
    ])
    const settingRepo = createSettingRepo()
    const repository = new PluginRepository({
      hasDb: () => true,
      getDb: () => createTransactionDb() as any,
      getPluginRepo: () => pluginRepo as any,
      getPluginCapabilityRepo: () => capabilityRepo as any,
      getPluginSettingRepo: () => ({ upsert() {}, deleteByPluginId() {} }) as any
    })
    const service = new PluginManifestSyncService({
      hasDb: () => true,
      getDb: () => createTransactionDb() as any,
      getPluginRepo: () => pluginRepo as any,
      getPluginCapabilityRepo: () => capabilityRepo as any,
      getPluginSettingRepo: () => settingRepo as any,
      pluginRepository: () => repository
    })

    const plugins = service.syncLocalPluginManifests([
      {
        pluginId: 'local-new',
        displayName: 'Local New',
        description: 'Manifest plugin',
        version: '2.0.0',
        manifestPath: '/plugins/local-new/plugin.json',
        installRoot: '/plugins/local-new',
        status: 'installed',
        capabilities: [{
          kind: 'request-adapter',
          providerType: 'claude',
          modelTypes: ['llm']
        }]
      }
    ])

    expect(plugins.find(plugin => plugin.pluginId === 'local-new')?.status).toBe('installed')
    expect(plugins.find(plugin => plugin.pluginId === 'local-existing')).toBeUndefined()
    expect(settingRepo.deletedPluginIds).toContain('local-existing')
  })

  it('preserves remote source when a remotely installed plugin is rescanned from disk', () => {
    const pluginRepo = createPluginRepo([
      {
        plugin_id: 'remote-existing',
        source: 'remote',
        display_name: 'Remote Existing',
        description: null,
        enabled: 1,
        version: '1.0.0',
        manifest_path: '/plugins/remote-existing/plugin.json',
        install_root: '/plugins/remote-existing',
        status: 'installed',
        last_error: null,
        created_at: 1,
        updated_at: 1
      }
    ])
    const capabilityRepo = createCapabilityRepo()
    const repository = new PluginRepository({
      hasDb: () => true,
      getDb: () => createTransactionDb() as any,
      getPluginRepo: () => pluginRepo as any,
      getPluginCapabilityRepo: () => capabilityRepo as any,
      getPluginSettingRepo: () => ({ upsert() {}, deleteByPluginId() {} }) as any
    })
    const service = new PluginManifestSyncService({
      hasDb: () => true,
      getDb: () => createTransactionDb() as any,
      getPluginRepo: () => pluginRepo as any,
      getPluginCapabilityRepo: () => capabilityRepo as any,
      getPluginSettingRepo: () => ({ deleteByPluginId() {} }) as any,
      pluginRepository: () => repository
    })

    const plugins = service.syncLocalPluginManifests([
      {
        pluginId: 'remote-existing',
        displayName: 'Remote Existing',
        description: 'Remote plugin',
        version: '1.0.1',
        manifestPath: '/plugins/remote-existing/plugin.json',
        installRoot: '/plugins/remote-existing',
        status: 'installed',
        capabilities: [{
          kind: 'request-adapter',
          providerType: 'openai-response',
          modelTypes: ['llm']
        }]
      }
    ])

    expect(plugins.find(plugin => plugin.pluginId === 'remote-existing')?.source).toBe('remote')
  })
})

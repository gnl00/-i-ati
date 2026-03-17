import { describe, expect, it } from 'vitest'
import { PluginDataService } from '../PluginDataService'

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
    countAll() {
      return rows.length
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

describe('PluginDataService', () => {
  it('ensures built-in plugins are available from the dedicated plugin table', () => {
    const pluginRepo = createPluginRepo()
    const capabilityRepo = createCapabilityRepo()
    const settingRepo = createSettingRepo()

    const service = new PluginDataService({
      hasDb: () => true,
      getDb: () => createTransactionDb() as any,
      getPluginRepo: () => pluginRepo as any,
      getPluginCapabilityRepo: () => capabilityRepo as any,
      getPluginSettingRepo: () => settingRepo as any,
      getConfigRepo: () => undefined
    })

    const configs = service.getPluginConfigs()
    const plugins = service.getPlugins()

    expect(configs.map(plugin => plugin.id)).toEqual([
      'openai-chat-compatible-adapter',
      'openai-image-compatible-adapter',
      'claude-compatible-adapter'
    ])
    expect(plugins).toHaveLength(3)
    expect(plugins[0]?.capabilities.length).toBeGreaterThan(0)
  })

  it('migrates legacy appConfig.plugins into the dedicated plugin tables on first read', () => {
    const pluginRepo = createPluginRepo()
    const capabilityRepo = createCapabilityRepo()
    const settingRepo = createSettingRepo()
    let savedConfigValue = JSON.stringify({
      version: 2,
      tools: { maxWebSearchItems: 3 },
      plugins: {
        items: [
          {
            id: 'openai-chat-compatible-adapter',
            enabled: false
          },
          {
            id: 'openai-image-compatible-adapter',
            enabled: false
          }
        ]
      }
    })

    const service = new PluginDataService({
      hasDb: () => true,
      getDb: () => createTransactionDb() as any,
      getPluginRepo: () => pluginRepo as any,
      getPluginCapabilityRepo: () => capabilityRepo as any,
      getPluginSettingRepo: () => settingRepo as any,
      getConfigRepo: () =>
        ({
          getConfig: () => ({
            key: 'appConfig',
            value: savedConfigValue,
            version: 2,
            updated_at: 1
          }),
          saveConfig: (value: string) => {
            savedConfigValue = value
          }
        }) as any
    })

    const configs = service.getPluginConfigs()

    expect(configs.find(plugin => plugin.id === 'openai-chat-compatible-adapter')?.enabled).toBe(false)
    expect(configs.find(plugin => plugin.id === 'openai-image-compatible-adapter')?.enabled).toBe(false)
    expect(configs.find(plugin => plugin.id === 'claude-compatible-adapter')?.enabled).toBe(true)
    expect(JSON.parse(savedConfigValue)).toEqual({
      version: 2,
      tools: { maxWebSearchItems: 3 }
    })
  })

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

    const service = new PluginDataService({
      hasDb: () => true,
      getDb: () => createTransactionDb() as any,
      getPluginRepo: () => pluginRepo as any,
      getPluginCapabilityRepo: () => capabilityRepo as any,
      getPluginSettingRepo: () => settingRepo as any,
      getConfigRepo: () => undefined
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
})

import { describe, expect, it } from 'vitest'
import { builtInPluginRegistry } from '@shared/plugins/builtInRegistry'
import { PluginRepository } from '../PluginRepository'

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

const createSettingRepo = () => ({
  upsert() {},
  deleteByPluginId() {}
})

describe('PluginRepository', () => {
  it('maps dedicated plugin rows and capabilities into entities', () => {
    const now = 1
    const pluginRepo = createPluginRepo(
      builtInPluginRegistry.listAll().map((definition, index) => ({
        plugin_id: definition.id,
        source: 'built-in',
        display_name: definition.name,
        description: definition.description,
        enabled: 1,
        version: null,
        manifest_path: null,
        install_root: null,
        status: 'installed',
        last_error: null,
        created_at: now + index,
        updated_at: now + index
      }))
    )
    const capabilityRepo = createCapabilityRepo(
      builtInPluginRegistry.listAll().flatMap((definition) => definition.capabilities.map((capability) => ({
        plugin_id: definition.id,
        capability_kind: capability.kind,
        capability_json: JSON.stringify(capability),
        created_at: now,
        updated_at: now
      })))
    )
    const settingRepo = createSettingRepo()

    const service = new PluginRepository({
      hasDb: () => true,
      getDb: () => createTransactionDb() as any,
      getPluginRepo: () => pluginRepo as any,
      getPluginCapabilityRepo: () => capabilityRepo as any,
      getPluginSettingRepo: () => settingRepo as any
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

  it('updates plugin source and maps malformed capability payloads safely', () => {
    const pluginRepo = createPluginRepo([
      {
        plugin_id: 'local-plugin',
        source: 'local',
        display_name: 'Local Plugin',
        description: null,
        enabled: 1,
        version: '1.0.0',
        manifest_path: '/plugins/local-plugin/plugin.json',
        install_root: '/plugins/local-plugin',
        status: 'installed',
        last_error: null,
        created_at: 1,
        updated_at: 1
      }
    ])
    const capabilityRepo = createCapabilityRepo([
      {
        plugin_id: 'local-plugin',
        capability_kind: 'request-adapter',
        capability_json: '{bad-json',
        created_at: 1,
        updated_at: 1
      }
    ])
    const settingRepo = createSettingRepo()

    const service = new PluginRepository({
      hasDb: () => true,
      getDb: () => createTransactionDb() as any,
      getPluginRepo: () => pluginRepo as any,
      getPluginCapabilityRepo: () => capabilityRepo as any,
      getPluginSettingRepo: () => settingRepo as any
    })

    const plugins = service.updatePluginSource('local-plugin', 'remote')

    expect(plugins.find(plugin => plugin.pluginId === 'local-plugin')?.source).toBe('remote')
    expect(plugins.find(plugin => plugin.pluginId === 'local-plugin')?.capabilities[0]?.data).toBeUndefined()
  })
})

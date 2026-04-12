import { describe, expect, it } from 'vitest'
import { PluginRepository } from '../../repositories/PluginRepository'
import { PluginBootstrapService } from '../PluginBootstrapService'

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
  deleteByPluginId() {}
})

describe('PluginBootstrapService', () => {
  it('ensures built-in plugins and capabilities are available from dedicated tables', () => {
    const pluginRepo = createPluginRepo()
    const capabilityRepo = createCapabilityRepo()
    const settingRepo = createSettingRepo()
    const repository = new PluginRepository({
      hasDb: () => true,
      getDb: () => createTransactionDb() as any,
      getPluginRepo: () => pluginRepo as any,
      getPluginCapabilityRepo: () => capabilityRepo as any,
      getPluginSettingRepo: () => settingRepo as any
    })

    const service = new PluginBootstrapService({
      getDb: () => createTransactionDb() as any,
      pluginRepository: () => repository,
      pluginDao: () => pluginRepo as any,
      pluginCapabilityDao: () => capabilityRepo as any,
      configDao: () => undefined
    })

    service.initialize()

    const configs = repository.getPluginConfigs()
    const plugins = repository.getPlugins()

    expect(configs.map(plugin => plugin.id)).toEqual([
      'openai-chat-compatible-adapter',
      'openai-image-compatible-adapter',
      'claude-compatible-adapter'
    ])
    expect(plugins).toHaveLength(3)
    expect(plugins[0]?.capabilities.length).toBeGreaterThan(0)
  })

  it('migrates legacy appConfig.plugins into dedicated plugin tables before seeding missing built-ins', () => {
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

    const repository = new PluginRepository({
      hasDb: () => true,
      getDb: () => createTransactionDb() as any,
      getPluginRepo: () => pluginRepo as any,
      getPluginCapabilityRepo: () => capabilityRepo as any,
      getPluginSettingRepo: () => settingRepo as any
    })

    const service = new PluginBootstrapService({
      getDb: () => createTransactionDb() as any,
      pluginRepository: () => repository,
      pluginDao: () => pluginRepo as any,
      pluginCapabilityDao: () => capabilityRepo as any,
      configDao: () =>
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

    service.initialize()

    const configs = repository.getPluginConfigs()

    expect(configs.find(plugin => plugin.id === 'openai-chat-compatible-adapter')?.enabled).toBe(false)
    expect(configs.find(plugin => plugin.id === 'openai-image-compatible-adapter')?.enabled).toBe(false)
    expect(configs.find(plugin => plugin.id === 'claude-compatible-adapter')?.enabled).toBe(true)
    expect(JSON.parse(savedConfigValue)).toEqual({
      version: 2,
      tools: { maxWebSearchItems: 3 }
    })
  })
})

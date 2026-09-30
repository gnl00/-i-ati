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
      pluginDao: () => pluginRepo as any,
      pluginCapabilityDao: () => capabilityRepo as any
    })

    service.initialize()

    const configs = repository.getPluginConfigs()
    const plugins = repository.getPlugins()

    expect(configs.map(plugin => plugin.id)).toEqual([
      'openai-chat-compatible-adapter',
      'openai-image-compatible-adapter',
      'claude-compatible-adapter',
      'openai-responses-compatible-adapter',
      'google-gemini-compatible-adapter'
    ])
    expect(plugins).toHaveLength(5)
    expect(plugins[0]?.capabilities.length).toBeGreaterThan(0)
    expect(
      plugins
        .find(plugin => plugin.pluginId === 'openai-chat-compatible-adapter')
        ?.capabilities
        .find(capability => capability.kind === 'request-adapter')
        ?.data
        ?.thinking
    ).toEqual({
      levels: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
      defaultLevel: 'medium'
    })
    expect(
      plugins
        .find(plugin => plugin.pluginId === 'claude-compatible-adapter')
        ?.capabilities
        .find(capability => capability.kind === 'request-adapter')
        ?.data
        ?.thinking
    ).toEqual({
      levels: ['low', 'medium', 'high', 'xhigh', 'max'],
      defaultLevel: 'medium'
    })
  })

})

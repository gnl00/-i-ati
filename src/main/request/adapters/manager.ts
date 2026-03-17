import { BaseAdapter } from './base'

// 适配器管理器
class AdapterManager {
  private adapters = new Map<string, BaseAdapter>()

  constructor() {
    // 在实现具体适配器后会在这里注册
  }

  register(pluginId: string, adapter: BaseAdapter) {
    this.adapters.set(pluginId, adapter)
  }

  clear() {
    this.adapters.clear()
  }

  getAdapter(pluginId: string): BaseAdapter {
    const adapter = this.adapters.get(pluginId)
    if (!adapter) {
      throw new Error(`No adapter found for plugin id: ${pluginId}`)
    }
    return adapter
  }
  listAdapters(): string[] {
    return Array.from(this.adapters.keys())
  }
}

export const adapterManager = new AdapterManager()

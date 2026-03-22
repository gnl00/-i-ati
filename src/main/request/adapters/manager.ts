import { BaseAdapter } from './base'

type FailedAdapterEntry = {
  fingerprint: string
  error: Error
}

// 适配器管理器
class AdapterManager {
  private adapters = new Map<string, BaseAdapter>()
  private fingerprints = new Map<string, string>()
  private failedAdapters = new Map<string, FailedAdapterEntry>()

  constructor() {
    // 在实现具体适配器后会在这里注册
  }

  register(pluginId: string, adapter: BaseAdapter, fingerprint?: string) {
    this.adapters.set(pluginId, adapter)
    if (fingerprint) {
      this.fingerprints.set(pluginId, fingerprint)
    } else {
      this.fingerprints.delete(pluginId)
    }
    this.failedAdapters.delete(pluginId)
  }

  clear() {
    this.adapters.clear()
    this.fingerprints.clear()
    this.failedAdapters.clear()
  }

  delete(pluginId: string) {
    this.adapters.delete(pluginId)
    this.fingerprints.delete(pluginId)
    this.failedAdapters.delete(pluginId)
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

  peekAdapter(pluginId: string): BaseAdapter | undefined {
    return this.adapters.get(pluginId)
  }

  getFingerprint(pluginId: string): string | undefined {
    return this.fingerprints.get(pluginId)
  }

  setFailedAdapter(pluginId: string, entry: FailedAdapterEntry): void {
    this.adapters.delete(pluginId)
    this.fingerprints.delete(pluginId)
    this.failedAdapters.set(pluginId, entry)
  }

  getFailedAdapter(pluginId: string): FailedAdapterEntry | undefined {
    return this.failedAdapters.get(pluginId)
  }
}

export const adapterManager = new AdapterManager()

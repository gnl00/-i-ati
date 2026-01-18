import { BaseAdapter } from './base'

// 适配器管理器
class AdapterManager {
  private adapters = new Map<string, BaseAdapter>()

  constructor() {
    // 在实现具体适配器后会在这里注册
  }

  register(adapter: BaseAdapter) {
    const key = `${adapter.providerType}-${adapter.apiVersion}`
    this.adapters.set(key, adapter)
    // console.log(`Registered adapter: ${key}`)
  }

  getAdapter(providerType: ProviderType, apiVersion: string = 'v1'): BaseAdapter {
    const key = `${providerType}-${apiVersion}`
    let adapter = this.adapters.get(key)

    if (!adapter) {
      // 如果找不到指定版本，尝试使用 v1 版本作为fallback
      const fallbackKey = `${providerType}-v1`
      adapter = this.adapters.get(fallbackKey)

      if (!adapter) {
        throw new Error(`No adapter found for provider type: ${providerType}`)
      }

      console.warn(`Adapter ${key} not found, using fallback: ${fallbackKey}`)
    }

    return adapter
  }

  // 获取支持的 Provider 类型列表
  getSupportedProviderTypes(): ProviderType[] {
    const types = new Set<ProviderType>()
    this.adapters.forEach(adapter => types.add(adapter.providerType))
    return Array.from(types)
  }

  // 获取指定 Provider 类型支持的 API 版本
  getSupportedVersions(providerType: ProviderType): string[] {
    const versions: string[] = []
    this.adapters.forEach(adapter => {
      if (adapter.providerType === providerType) {
        versions.push(adapter.apiVersion)
      }
    })
    return versions
  }

  // 列出所有已注册的适配器
  listAdapters(): string[] {
    return Array.from(this.adapters.keys())
  }
}

export const adapterManager = new AdapterManager()
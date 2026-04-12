import type { ConfigDao } from '@main/db/dao/ConfigDao'
import { ProviderDefinitionLoader } from '../core/ProviderDefinitionLoader'
import type { ProviderRepository } from './ProviderRepository'

type ConfigRepositoryDeps = {
  hasDb: () => boolean
  getConfigRepo: () => ConfigDao | undefined
  providerRepository: () => ProviderRepository | undefined
}

export class ConfigRepository {
  private readonly providerDefinitionLoader: ProviderDefinitionLoader

  constructor(private readonly deps: ConfigRepositoryDeps) {
    this.providerDefinitionLoader = new ProviderDefinitionLoader()
  }

  getConfig(): IAppConfig | undefined {
    this.assertDbReady()

    const row = this.requireConfigRepo().getConfig()
    if (!row) return undefined

    const config = JSON.parse(row.value) as IAppConfig
    const { mcp: _legacyMcp, plugins: _legacyPlugins, ...baseConfig } = config
    const providerDefinitions = this.requireProviderRepository().getProviderDefinitions()
    const accounts = this.requireProviderRepository().getProviderAccounts()

    return {
      ...baseConfig,
      providerDefinitions,
      accounts
    }
  }

  saveConfig(config: IAppConfig): void {
    this.assertDbReady()

    const hasDefinitions = Object.prototype.hasOwnProperty.call(config, 'providerDefinitions')
    const hasAccounts = Object.prototype.hasOwnProperty.call(config, 'accounts')

    if (hasDefinitions) {
      this.requireProviderRepository().saveProviderDefinitionsToDb(config.providerDefinitions ?? [])
    }

    if (hasAccounts) {
      this.requireProviderRepository().saveProviderAccountsToDb(config.accounts ?? [])
    }

    const { providerDefinitions: _defs, accounts: _accounts, mcp: _mcp, plugins: _plugins, ...baseConfig } = config
    const normalizedConfig: IAppConfig = {
      ...baseConfig
    }
    this.requireConfigRepo().saveConfig(
      JSON.stringify(normalizedConfig),
      normalizedConfig.version ?? null
    )
  }

  getConfigValue(key: string): string | undefined {
    this.assertDbReady()
    if (!key) return undefined
    return this.requireConfigRepo().getValue(key)
  }

  saveConfigValue(key: string, value: string, version?: number | null): void {
    this.assertDbReady()
    if (!key) return
    this.requireConfigRepo().saveValue(key, value, version ?? null)
  }

  initConfig(): IAppConfig {
    this.assertDbReady()

    const defaultProviderDefinitions = this.providerDefinitionLoader.load()

    const defaultConfig: IAppConfig = {
      version: 2.0,
      tools: {
        maxWebSearchItems: 3,
        streamChunkDebugEnabled: false
      },
      configForUpdate: {
        version: 2.0
      }
    }

    let config = this.getConfig()

    if (!config) {
      this.saveConfig(defaultConfig)
      this.requireProviderRepository().ensureProviderDefinitions(defaultProviderDefinitions)
      return {
        ...defaultConfig,
        providerDefinitions: this.requireProviderRepository().getProviderDefinitions(),
        accounts: this.requireProviderRepository().getProviderAccounts()
      }
    }

    const providerCount = this.requireProviderRepository().countProviderDefinitions()
    if (providerCount === 0) {
      this.requireProviderRepository().ensureProviderDefinitions(defaultProviderDefinitions)
    }

    if (defaultConfig.version! > config.version!) {
      const nextConfig = {
        ...config,
        ...defaultConfig.configForUpdate,
        version: defaultConfig.version
      }
      this.saveConfig(nextConfig)
      config = nextConfig
    }

    return {
      ...config,
      providerDefinitions: this.requireProviderRepository().getProviderDefinitions(),
      accounts: this.requireProviderRepository().getProviderAccounts()
    }
  }

  private assertDbReady(): void {
    if (!this.deps.hasDb()) {
      throw new Error('Database not initialized')
    }
  }

  private requireConfigRepo(): ConfigDao {
    const repo = this.deps.getConfigRepo()
    if (!repo) throw new Error('Config repository not initialized')
    return repo
  }

  private requireProviderRepository(): ProviderRepository {
    const service = this.deps.providerRepository()
    if (!service) throw new Error('Provider repository not initialized')
    return service
  }
}

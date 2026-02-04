import type { ConfigRepository } from '@main/db/repositories/ConfigRepository'
import type { ProviderRepository } from '@main/db/repositories/ProviderRepository'
import { ProviderDataService } from './ProviderDataService'
import { ProviderDefinitionLoader } from './ProviderDefinitionLoader'

type ConfigDataServiceDeps = {
  hasDb: () => boolean
  getDb: () => ReturnType<import('@main/db/Database').AppDatabase['getDb']> | null
  getConfigRepo: () => ConfigRepository | undefined
  getProviderRepo: () => ProviderRepository | undefined
}

export class ConfigDataService {
  private readonly providerDataService: ProviderDataService
  private readonly providerDefinitionLoader: ProviderDefinitionLoader

  constructor(private readonly deps: ConfigDataServiceDeps) {
    this.providerDataService = new ProviderDataService({
      hasDb: deps.hasDb,
      getDb: deps.getDb,
      getProviderRepo: deps.getProviderRepo
    })
    this.providerDefinitionLoader = new ProviderDefinitionLoader()
  }

  getConfig(): IAppConfig | undefined {
    this.assertDbReady()

    const row = this.requireConfigRepo().getConfig()
    if (!row) return undefined

    const config = JSON.parse(row.value) as IAppConfig
    const providerDefinitions = this.providerDataService.getProviderDefinitions()
    const accounts = this.providerDataService.getProviderAccounts()

    return {
      ...config,
      providerDefinitions,
      accounts
    }
  }

  saveConfig(config: IAppConfig): void {
    this.assertDbReady()

    const hasDefinitions = Object.prototype.hasOwnProperty.call(config, 'providerDefinitions')
    const hasAccounts = Object.prototype.hasOwnProperty.call(config, 'accounts')

    if (hasDefinitions) {
      this.providerDataService.saveProviderDefinitionsToDb(config.providerDefinitions ?? [])
    }

    if (hasAccounts) {
      this.providerDataService.saveProviderAccountsToDb(config.accounts ?? [])
    }

    const { providerDefinitions: _defs, accounts: _accounts, ...baseConfig } = config
    this.requireConfigRepo().saveConfig(
      JSON.stringify(baseConfig),
      baseConfig.version ?? null
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
        maxWebSearchItems: 3
      },
      configForUpdate: {
        version: 2.0
      }
    }

    let config = this.getConfig()

    if (!config) {
      this.saveConfig(defaultConfig)
      this.providerDataService.ensureProviderDefinitions(defaultProviderDefinitions)
      return {
        ...defaultConfig,
        providerDefinitions: this.providerDataService.getProviderDefinitions(),
        accounts: this.providerDataService.getProviderAccounts()
      }
    }

    const providerCount = this.providerDataService.countProviderDefinitions()
    if (providerCount === 0) {
      this.providerDataService.ensureProviderDefinitions(defaultProviderDefinitions)
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
      providerDefinitions: this.providerDataService.getProviderDefinitions(),
      accounts: this.providerDataService.getProviderAccounts()
    }
  }

  getProviderDefinitions(): ProviderDefinition[] {
    return this.providerDataService.getProviderDefinitions()
  }

  saveProviderDefinition(definition: ProviderDefinition): void {
    this.providerDataService.saveProviderDefinition(definition)
  }

  deleteProviderDefinition(providerId: string): void {
    this.providerDataService.deleteProviderDefinition(providerId)
  }

  getProviderAccounts(): ProviderAccount[] {
    return this.providerDataService.getProviderAccounts()
  }

  saveProviderAccount(account: ProviderAccount): void {
    this.providerDataService.saveProviderAccount(account)
  }

  deleteProviderAccount(accountId: string): void {
    this.providerDataService.deleteProviderAccount(accountId)
  }

  saveProviderModel(accountId: string, model: AccountModel): void {
    this.providerDataService.saveProviderModel(accountId, model)
  }

  deleteProviderModel(accountId: string, modelId: string): void {
    this.providerDataService.deleteProviderModel(accountId, modelId)
  }

  setProviderModelEnabled(accountId: string, modelId: string, enabled: boolean): void {
    this.providerDataService.setProviderModelEnabled(accountId, modelId, enabled)
  }

  private assertDbReady(): void {
    if (!this.deps.hasDb()) {
      throw new Error('Database not initialized')
    }
  }

  private requireConfigRepo(): ConfigRepository {
    const repo = this.deps.getConfigRepo()
    if (!repo) throw new Error('Config repository not initialized')
    return repo
  }
}

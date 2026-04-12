import { configEventEmitter } from '@main/config/event-emitter'
import type { ConfigRepository } from '../repositories/ConfigRepository'
import type { McpServerRepository } from '../repositories/McpServerRepository'
import type { ProviderRepository } from '../repositories/ProviderRepository'

type ConfigServiceDeps = {
  configRepository: () => ConfigRepository | undefined
  mcpServerRepository: () => McpServerRepository | undefined
  providerRepository: () => ProviderRepository | undefined
}

export class ConfigService {
  constructor(private readonly deps: ConfigServiceDeps) {}

  getConfig(): IAppConfig | undefined {
    return this.requireConfigRepository().getConfig()
  }

  saveConfig(config: IAppConfig): void {
    if (config.mcp) {
      this.requireMcpServerRepository().saveMcpServerConfig(config.mcp)
    }
    this.requireConfigRepository().saveConfig(config)
    configEventEmitter.emitUpdated('database.saveConfig')
  }

  getConfigValue(key: string): string | undefined {
    return this.requireConfigRepository().getConfigValue(key)
  }

  saveConfigValue(key: string, value: string, version?: number | null): void {
    this.requireConfigRepository().saveConfigValue(key, value, version)
  }

  initConfig(): IAppConfig {
    return this.requireConfigRepository().initConfig()
  }

  getMcpServerConfig(): McpServerConfig {
    return this.requireMcpServerRepository().getMcpServerConfig()
  }

  saveMcpServerConfig(config: McpServerConfig): void {
    this.requireMcpServerRepository().saveMcpServerConfig(config)
  }

  getProviderDefinitions(): ProviderDefinition[] {
    return this.requireProviderRepository().getProviderDefinitions()
  }

  saveProviderDefinition(definition: ProviderDefinition): void {
    this.requireProviderRepository().saveProviderDefinition(definition)
  }

  deleteProviderDefinition(providerId: string): void {
    this.requireProviderRepository().deleteProviderDefinition(providerId)
  }

  getProviderAccounts(): ProviderAccount[] {
    return this.requireProviderRepository().getProviderAccounts()
  }

  saveProviderAccount(account: ProviderAccount): void {
    this.requireProviderRepository().saveProviderAccount(account)
  }

  deleteProviderAccount(accountId: string): void {
    this.requireProviderRepository().deleteProviderAccount(accountId)
  }

  saveProviderModel(accountId: string, model: AccountModel): void {
    this.requireProviderRepository().saveProviderModel(accountId, model)
  }

  deleteProviderModel(accountId: string, modelId: string): void {
    this.requireProviderRepository().deleteProviderModel(accountId, modelId)
  }

  setProviderModelEnabled(accountId: string, modelId: string, enabled: boolean): void {
    this.requireProviderRepository().setProviderModelEnabled(accountId, modelId, enabled)
  }

  private requireConfigRepository(): ConfigRepository {
    const repository = this.deps.configRepository()
    if (!repository) throw new Error('Config repository not initialized')
    return repository
  }

  private requireMcpServerRepository(): McpServerRepository {
    const repository = this.deps.mcpServerRepository()
    if (!repository) throw new Error('MCP server repository not initialized')
    return repository
  }

  private requireProviderRepository(): ProviderRepository {
    const repository = this.deps.providerRepository()
    if (!repository) throw new Error('Provider repository not initialized')
    return repository
  }
}

import DatabaseService from './DatabaseService'

export const configDb = {
  getConfig(): IAppConfig | undefined {
    return DatabaseService.getConfig()
  },

  saveConfig(config: IAppConfig): void {
    DatabaseService.saveConfig(config)
  },

  initConfig(): IAppConfig {
    return DatabaseService.initConfig()
  },

  getConfigValue(key: string): string | undefined {
    return DatabaseService.getConfigValue(key)
  },

  saveConfigValue(key: string, value: string, version?: number | null): void {
    DatabaseService.saveConfigValue(key, value, version)
  },

  getMcpServerConfig(): McpServerConfig {
    return DatabaseService.getMcpServerConfig()
  },

  saveMcpServerConfig(config: McpServerConfig): void {
    DatabaseService.saveMcpServerConfig(config)
  },

  getProviderDefinitions(): ProviderDefinition[] {
    return DatabaseService.getProviderDefinitions()
  },

  saveProviderDefinition(definition: ProviderDefinition): void {
    DatabaseService.saveProviderDefinition(definition)
  },

  deleteProviderDefinition(providerId: string): void {
    DatabaseService.deleteProviderDefinition(providerId)
  },

  getProviderAccounts(): ProviderAccount[] {
    return DatabaseService.getProviderAccounts()
  },

  saveProviderAccount(account: ProviderAccount): void {
    DatabaseService.saveProviderAccount(account)
  },

  deleteProviderAccount(accountId: string): void {
    DatabaseService.deleteProviderAccount(accountId)
  },

  saveProviderModel(accountId: string, model: AccountModel): void {
    DatabaseService.saveProviderModel(accountId, model)
  },

  deleteProviderModel(accountId: string, modelId: string): void {
    DatabaseService.deleteProviderModel(accountId, modelId)
  },

  setProviderModelEnabled(accountId: string, modelId: string, enabled: boolean): void {
    DatabaseService.setProviderModelEnabled(accountId, modelId, enabled)
  },

  isReady(): boolean {
    return DatabaseService.isReady()
  }
}

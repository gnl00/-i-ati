import {
  invokeDbConfigGet,
  invokeDbConfigSave,
  invokeDbConfigInit
} from '@renderer/invoker/ipcInvoker'

// Get config (returns undefined if not found)
const getConfig = async (): Promise<IAppConfig | undefined> => {
  return await invokeDbConfigGet()
}

// Save config (creates or updates)
const saveConfig = async (config: IAppConfig): Promise<void> => {
  return await invokeDbConfigSave(config)
}

// Initialize config with defaults if not exists
const initConfig = async (): Promise<IAppConfig> => {
  return await invokeDbConfigInit()
}

// Export config as JSON string
const exportConfigAsJSON = async (options?: {
  includeProviders?: boolean
}): Promise<string> => {
  const config = await getConfig()
  if (!config) throw new Error('No config to export')

  if (!options?.includeProviders) {
    return JSON.stringify(config, null, 2)
  }

  const { getProviderDefinitions, getProviderAccounts } = await import('./ProviderRepository')
  const providerDefinitions = await getProviderDefinitions()
  const accounts = await getProviderAccounts()

  return JSON.stringify({
    ...config,
    providerDefinitions,
    accounts
  }, null, 2)
}

// Import config from JSON string
const importConfigFromJSON = async (jsonString: string): Promise<void> => {
  const config = JSON.parse(jsonString) as IAppConfig
  // Validate basic structure
  if (!config.version) throw new Error('Invalid config format')
  await saveConfig(config)
}

export {
  exportConfigAsJSON, getConfig, importConfigFromJSON, initConfig, saveConfig
}

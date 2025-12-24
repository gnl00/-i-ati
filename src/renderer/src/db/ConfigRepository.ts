import { defaultConfig } from '../config'
import { dbPromise, CONFIG_STORE as STORE_NAME } from './index'

// Get config (returns undefined if not found)
const getConfig = async (): Promise<IAppConfig | undefined> => {
  const db = await dbPromise
  return db.get(STORE_NAME, 'appConfig')
}

// Save config (creates or updates)
const saveConfig = async (config: IAppConfig): Promise<void> => {
  const db = await dbPromise
  await db.put(STORE_NAME, { key: 'appConfig', ...config })
}

// Initialize config with defaults if not exists
const initConfig = async (): Promise<IAppConfig> => {
  let config = await getConfig()

  if (!config) {
    // First time, use default config
    await saveConfig(defaultConfig)
    return defaultConfig
  }

  // Check version and upgrade if needed
  if (defaultConfig.version! > config.version!) {
    const upgraded = {
      ...config,
      ...defaultConfig.configForUpdate,
      version: defaultConfig.version
    }
    await saveConfig(upgraded)
    return upgraded
  }

  return config
}

// Export config as JSON string
const exportConfigAsJSON = async (): Promise<string> => {
  const config = await getConfig()
  if (!config) throw new Error('No config to export')
  return JSON.stringify(config, null, 2)
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


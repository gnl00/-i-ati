import { configDb } from '@main/db/config'

export class AppConfigStore {
  getConfig(): IAppConfig | null {
    return configDb.getConfig() || null
  }

  requireConfig(): IAppConfig {
    const config = this.getConfig()
    if (!config) {
      throw new Error('App config not found')
    }
    return config
  }
}

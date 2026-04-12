import DatabaseService from '@main/db/DatabaseService'

export class AppConfigStore {
  getConfig(): IAppConfig | null {
    return DatabaseService.getConfig() || null
  }

  requireConfig(): IAppConfig {
    const config = this.getConfig()
    if (!config) {
      throw new Error('App config not found')
    }
    return config
  }
}

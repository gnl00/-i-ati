// embedded config for app
// configForUpdate only work on configVersion > previous version
const configVersion = 1.9
export const defaultConfig: IAppConfig = {
  providers: [],
  version: configVersion,
  tools: {
    maxWebSearchItems: 3,
    memoryEnabled: true
  },
  compression: {
    enabled: true,
    triggerThreshold: 30,
    keepRecentCount: 20,
    compressCount: 10,
    autoCompress: true
  },
  configForUpdate: {
    version: configVersion,
  }
}

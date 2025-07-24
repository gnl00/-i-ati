// embedded config for app
// configForUpdate only work on configVersion > previous version
const configVersion = 1.9
export const defaultConfig: IAppConfig = {
  providers: [],
  version: configVersion,
  configForUpdate: {
    version: configVersion,
  }
}


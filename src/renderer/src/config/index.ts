// embedded config for app
// configForUpdate only work on configVersion > previous version
const configVersion = 1.9
export const defaultConfig: IAppConfig = {
  providers: [],
  version: configVersion,
  tools: {
    maxWebSearchItems: 3
  },
  configForUpdate: {
    version: configVersion,
  }
}


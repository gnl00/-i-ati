import officialProviderDefinitions from '@resources/providers/providers.json'

// embedded config for app
// configForUpdate only work on configVersion > previous version
const configVersion = 2.0
export const defaultConfig: IAppConfig = {
  providerDefinitions: officialProviderDefinitions as ProviderDefinition[],
  accounts: [],
  version: configVersion,
  tools: {
    maxWebSearchItems: 3,
    memoryEnabled: true,
    streamChunkDebugEnabled: false
  },
  skills: {
    folders: []
  },
  knowledgebase: {
    enabled: false,
    folders: [],
    autoIndexOnStartup: true,
    chunkSize: 1200,
    chunkOverlap: 200,
    maxResults: 8,
    retrievalMode: 'tool-first'
  },
  compression: {
    enabled: true,
    triggerTokenRatio: 0.7,
    autoCompress: true
  },
  emotion: {
    assetPack: 'default'
  },
  configForUpdate: {
    version: configVersion,
  }
}

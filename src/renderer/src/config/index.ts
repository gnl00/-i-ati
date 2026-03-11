import officialProviderDefinitions from '../../../data/providers.json'

// embedded config for app
// configForUpdate only work on configVersion > previous version
const configVersion = 2.0
export const defaultConfig: IAppConfig = {
  providerDefinitions: officialProviderDefinitions as ProviderDefinition[],
  accounts: [],
  version: configVersion,
  tools: {
    maxWebSearchItems: 3,
    memoryEnabled: true
  },
  skills: {
    folders: []
  },
  plugins: {
    items: [
      {
        id: 'openai-compatible-adapter',
        name: 'OpenAICompatibleAdapter',
        description: 'Placeholder test plugin for OpenAI-compatible adapter integration.',
        enabled: true
      },
      {
        id: 'claude-compatible-adapter',
        name: 'ClaudeCompatibleAdapter',
        description: 'Placeholder test plugin for Claude-compatible adapter integration.',
        enabled: true
      }
    ]
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

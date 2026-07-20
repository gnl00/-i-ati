import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const webToolMetadata = {
  web_search: {
    capability: 'web',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'allow'
  },
  web_fetch: {
    capability: 'web',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'allow',
    resultCompaction: {
      enabled: true,
      level: 'balanced',
      compactorId: 'web-document',
      modelInputPolicy: 'redact-secrets'
    }
  }
} satisfies EmbeddedToolMetadataMap

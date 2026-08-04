import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const commandToolMetadata = {
  exec: {
    capability: 'command',
    riskLevel: 'dangerous',
    mutatesWorkspace: true,
    subagent: 'allow',
    resultCompaction: {
      enabled: true,
      level: 'balanced',
      compactorId: 'command-output',
      modelInputPolicy: 'redact-secrets'
    }
  }
} satisfies EmbeddedToolMetadataMap

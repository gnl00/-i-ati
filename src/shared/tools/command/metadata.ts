import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const commandToolMetadata = {
  exec: {
    capability: 'command',
    riskLevel: 'dangerous',
    mutatesWorkspace: true,
    subagent: 'allow'
  }
} satisfies EmbeddedToolMetadataMap

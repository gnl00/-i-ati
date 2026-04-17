import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const commandToolMetadata = {
  execute_command: {
    capability: 'command',
    riskLevel: 'dangerous',
    mutatesWorkspace: true,
    subagent: 'allow'
  }
} satisfies EmbeddedToolMetadataMap

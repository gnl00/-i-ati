import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const subagentToolMetadata = {
  subagent_spawn: {
    capability: 'subagent',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  subagent_wait: {
    capability: 'subagent',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  }
} satisfies EmbeddedToolMetadataMap

import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const memoryToolMetadata = {
  memory_retrieval: {
    capability: 'memory',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'allow'
  },
  memory_save: {
    capability: 'memory',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  memory_update: {
    capability: 'memory',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  }
} satisfies EmbeddedToolMetadataMap

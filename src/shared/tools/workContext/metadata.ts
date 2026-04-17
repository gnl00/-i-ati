import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const workContextToolMetadata = {
  work_context_get: {
    capability: 'memory',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'allow'
  },
  work_context_set: {
    capability: 'memory',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  }
} satisfies EmbeddedToolMetadataMap

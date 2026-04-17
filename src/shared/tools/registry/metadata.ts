import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const registryToolMetadata = {
  list_tools: {
    capability: 'registry',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  search_tools: {
    capability: 'registry',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  }
} satisfies EmbeddedToolMetadataMap

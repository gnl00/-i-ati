import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const historyToolMetadata = {
  history_search: {
    capability: 'memory',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'allow'
  }
} satisfies EmbeddedToolMetadataMap

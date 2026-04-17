import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const logToolMetadata = {
  log_search: {
    capability: 'log',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  }
} satisfies EmbeddedToolMetadataMap

import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const knowledgebaseToolMetadata = {
  knowledgebase_search: {
    capability: 'knowledgebase',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  }
} satisfies EmbeddedToolMetadataMap


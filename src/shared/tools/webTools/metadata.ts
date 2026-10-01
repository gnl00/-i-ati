import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const webToolMetadata = {
  web_search: {
    capability: 'web',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'allow'
  },
  web_fetch: {
    capability: 'web',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'allow'
  }
} satisfies EmbeddedToolMetadataMap

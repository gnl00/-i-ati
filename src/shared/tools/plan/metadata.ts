import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const planToolMetadata = {
  plan: {
    capability: 'plan',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  }
} satisfies EmbeddedToolMetadataMap

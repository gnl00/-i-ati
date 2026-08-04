import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const subagentToolMetadata = {
  subagent: {
    capability: 'subagent',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny',
    actionOverrides: {
      spawn: { capability: 'subagent', riskLevel: 'warning', mutatesWorkspace: false },
      wait: { capability: 'subagent', riskLevel: 'none', mutatesWorkspace: false }
    }
  }
} satisfies EmbeddedToolMetadataMap

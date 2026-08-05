import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const sessionContextToolMetadata = {
  session_context: {
    capability: 'memory',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny',
    actionOverrides: {
      get: { capability: 'memory', riskLevel: 'none', mutatesWorkspace: false },
      set: { capability: 'memory', riskLevel: 'none', mutatesWorkspace: false }
    }
  }
} satisfies EmbeddedToolMetadataMap

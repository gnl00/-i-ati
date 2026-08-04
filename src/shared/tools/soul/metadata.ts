import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const soulToolMetadata = {
  soul: {
    capability: 'soul',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny',
    actionOverrides: {
      get: { capability: 'soul', riskLevel: 'none', mutatesWorkspace: false },
      edit: { capability: 'soul', riskLevel: 'warning', mutatesWorkspace: false },
      reset: { capability: 'soul', riskLevel: 'warning', mutatesWorkspace: false }
    }
  }
} satisfies EmbeddedToolMetadataMap

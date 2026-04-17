import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const soulToolMetadata = {
  get_soul: {
    capability: 'soul',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  edit_soul: {
    capability: 'soul',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  reset_soul: {
    capability: 'soul',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  }
} satisfies EmbeddedToolMetadataMap

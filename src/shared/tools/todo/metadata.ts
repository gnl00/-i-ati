import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const todoToolMetadata = {
  todo: {
    capability: 'todo',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  }
} satisfies EmbeddedToolMetadataMap

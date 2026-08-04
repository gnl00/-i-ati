import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const scheduleToolMetadata = {
  schedule: {
    capability: 'schedule',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  }
} satisfies EmbeddedToolMetadataMap

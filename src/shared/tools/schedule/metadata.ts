import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const scheduleToolMetadata = {
  schedule_create: {
    capability: 'schedule',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  schedule_list: {
    capability: 'schedule',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  schedule_cancel: {
    capability: 'schedule',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  schedule_update: {
    capability: 'schedule',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  }
} satisfies EmbeddedToolMetadataMap

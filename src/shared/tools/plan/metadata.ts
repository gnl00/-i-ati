import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const planToolMetadata = {
  plan_create: {
    capability: 'plan',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  plan_update: {
    capability: 'plan',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  plan_update_status: {
    capability: 'plan',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  plan_get_by_id: {
    capability: 'plan',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  plan_get_current_chat: {
    capability: 'plan',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  plan_delete: {
    capability: 'plan',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  plan_step_upsert: {
    capability: 'plan',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  }
} satisfies EmbeddedToolMetadataMap

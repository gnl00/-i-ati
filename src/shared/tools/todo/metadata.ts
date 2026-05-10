import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const todoToolMetadata = {
  todo_add: {
    capability: 'todo',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  todo_list: {
    capability: 'todo',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  todo_update: {
    capability: 'todo',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  todo_delete: {
    capability: 'todo',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  }
} satisfies EmbeddedToolMetadataMap

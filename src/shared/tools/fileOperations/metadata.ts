import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const fileOperationsToolMetadata = {
  read: {
    capability: 'filesystem_read',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'allow'
  },
  read_media: {
    capability: 'filesystem_read',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  write: {
    capability: 'filesystem_write',
    riskLevel: 'none',
    mutatesWorkspace: true,
    subagent: 'allow',
    roles: ['general', 'coder']
  },
  edit: {
    capability: 'filesystem_write',
    riskLevel: 'none',
    mutatesWorkspace: true,
    subagent: 'allow',
    roles: ['general', 'coder']
  },
  grep: {
    capability: 'filesystem_read',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'allow'
  },
  ls: {
    capability: 'filesystem_read',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'allow'
  },
  glob: {
    capability: 'filesystem_read',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'allow'
  },
  tree: {
    capability: 'filesystem_read',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  stat: {
    capability: 'filesystem_read',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  list_allowed_directories: {
    capability: 'filesystem_read',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  mkdir: {
    capability: 'filesystem_write',
    riskLevel: 'warning',
    mutatesWorkspace: true,
    subagent: 'deny'
  },
  mv: {
    capability: 'filesystem_write',
    riskLevel: 'warning',
    mutatesWorkspace: true,
    subagent: 'deny'
  }
} satisfies EmbeddedToolMetadataMap

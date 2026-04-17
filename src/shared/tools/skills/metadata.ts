import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const skillToolMetadata = {
  install_skill: {
    capability: 'skill',
    riskLevel: 'warning',
    mutatesWorkspace: true,
    subagent: 'deny'
  },
  load_skill: {
    capability: 'skill',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  import_skills: {
    capability: 'skill',
    riskLevel: 'warning',
    mutatesWorkspace: true,
    subagent: 'deny'
  },
  unload_skill: {
    capability: 'skill',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  read_skill_file: {
    capability: 'skill',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  }
} satisfies EmbeddedToolMetadataMap

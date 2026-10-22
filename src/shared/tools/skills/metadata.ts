import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const skillToolMetadata = {
  load_skill: {
    capability: 'skill',
    riskLevel: 'warning',
    mutatesWorkspace: false,
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
  },
  run_skill_script: {
    capability: 'skill',
    riskLevel: 'warning',
    mutatesWorkspace: true,
    subagent: 'deny'
  }
} satisfies EmbeddedToolMetadataMap

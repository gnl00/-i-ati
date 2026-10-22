import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const subagentToolMetadata = {
  subagent: {
    capability: 'subagent',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny',
    actionOverrides: {
      spawn: { capability: 'subagent', riskLevel: 'warning', mutatesWorkspace: false },
      wait: { capability: 'subagent', riskLevel: 'none', mutatesWorkspace: false },
      cancel: { capability: 'subagent', riskLevel: 'none', mutatesWorkspace: false },
      inspect: { capability: 'subagent', riskLevel: 'none', mutatesWorkspace: false },
      list: { capability: 'subagent', riskLevel: 'none', mutatesWorkspace: false },
      send_message: { capability: 'subagent', riskLevel: 'none', mutatesWorkspace: false },
      followup_task: { capability: 'subagent', riskLevel: 'warning', mutatesWorkspace: false },
      resume: { capability: 'subagent', riskLevel: 'warning', mutatesWorkspace: false },
      interrupt: { capability: 'subagent', riskLevel: 'none', mutatesWorkspace: false }
    }
  }
} satisfies EmbeddedToolMetadataMap

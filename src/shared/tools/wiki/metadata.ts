import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const wikiToolMetadata = {
  wiki: {
    capability: 'filesystem_read',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny',
    actionOverrides: {
      list: { capability: 'filesystem_read', riskLevel: 'none', mutatesWorkspace: false },
      read: { capability: 'filesystem_read', riskLevel: 'none', mutatesWorkspace: false },
      write: { capability: 'filesystem_write', riskLevel: 'warning', mutatesWorkspace: true },
      delete: { capability: 'filesystem_write', riskLevel: 'dangerous', mutatesWorkspace: true },
      search: { capability: 'knowledgebase', riskLevel: 'warning', mutatesWorkspace: false }
    }
  }
} satisfies EmbeddedToolMetadataMap

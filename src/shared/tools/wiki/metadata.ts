import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const wikiToolMetadata = {
  wiki_list: {
    capability: 'filesystem_read',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  wiki_read: {
    capability: 'filesystem_read',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  wiki_write: {
    capability: 'filesystem_write',
    riskLevel: 'warning',
    mutatesWorkspace: true,
    subagent: 'deny'
  },
  wiki_delete: {
    capability: 'filesystem_write',
    riskLevel: 'dangerous',
    mutatesWorkspace: true,
    subagent: 'deny'
  },
  wiki_search: {
    capability: 'knowledgebase',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  }
} satisfies EmbeddedToolMetadataMap

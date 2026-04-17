import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const activityJournalToolMetadata = {
  activity_journal_append: {
    capability: 'journal',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  activity_journal_list: {
    capability: 'journal',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  activity_journal_search: {
    capability: 'journal',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'allow'
  }
} satisfies EmbeddedToolMetadataMap

import type { SubagentRole } from './subagent/index.d'

export type EmbeddedToolRiskLevel = 'none' | 'warning' | 'dangerous'

export type EmbeddedToolCapability =
  | 'filesystem_read'
  | 'filesystem_write'
  | 'web'
  | 'memory'
  | 'journal'
  | 'command'
  | 'plan'
  | 'schedule'
  | 'skill'
  | 'soul'
  | 'emotion'
  | 'user_info'
  | 'plugin'
  | 'telegram'
  | 'subagent'
  | 'log'
  | 'knowledgebase'
  | 'registry'

export interface EmbeddedToolMetadata {
  capability: EmbeddedToolCapability
  riskLevel: EmbeddedToolRiskLevel
  mutatesWorkspace: boolean
  subagent: 'allow' | 'deny'
  roles?: SubagentRole[]
}

export type EmbeddedToolMetadataMap = Record<string, EmbeddedToolMetadata>

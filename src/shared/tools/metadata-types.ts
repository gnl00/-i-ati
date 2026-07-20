import type { SubagentRole } from './subagent/index.d'

export type EmbeddedToolRiskLevel = 'none' | 'warning' | 'dangerous'

export type ToolResultCompactionLevel = 'balanced' | 'minimal'
export type ToolResultCompactionModelInputPolicy = 'redact-secrets' | 'verbatim'

export interface ToolResultCompactionMetadata {
  enabled: boolean
  level: ToolResultCompactionLevel
  compactorId: string
  modelInputPolicy?: ToolResultCompactionModelInputPolicy
}

export type EmbeddedToolCapability =
  | 'filesystem_read'
  | 'filesystem_write'
  | 'web'
  | 'memory'
  | 'journal'
  | 'command'
  | 'computer_use'
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
  | 'todo'
  | 'registry'
  | 'chat'
  | 'vision'

export interface EmbeddedToolMetadata {
  capability: EmbeddedToolCapability
  riskLevel: EmbeddedToolRiskLevel
  mutatesWorkspace: boolean
  subagent: 'allow' | 'deny'
  roles?: SubagentRole[]
  resultCompaction?: ToolResultCompactionMetadata
}

export type EmbeddedToolMetadataMap = Record<string, EmbeddedToolMetadata>

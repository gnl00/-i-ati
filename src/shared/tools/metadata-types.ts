import type { SubagentRole } from './subagent/index.d'

export type EmbeddedToolRiskLevel = 'none' | 'warning' | 'dangerous'

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
  /** Inject runtime chat_uuid into arguments; defaults to true for compatibility. */
  needChatUUID?: boolean
  capability: EmbeddedToolCapability
  riskLevel: EmbeddedToolRiskLevel
  mutatesWorkspace: boolean
  subagent: 'allow' | 'deny'
  roles?: SubagentRole[]
  actionOverrides?: Record<
    string,
    Partial<Pick<EmbeddedToolMetadata, 'capability' | 'riskLevel' | 'mutatesWorkspace'>>
  >
}

export type EmbeddedToolMetadataMap = Record<string, EmbeddedToolMetadata>

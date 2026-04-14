import type { SubagentRecord } from '@tools/subagent/index.d'

export const SUBAGENT_EVENTS = {
  SUBAGENT_UPDATED: 'subagent.updated'
} as const

export type SubagentEventPayloads = {
  'subagent.updated': { subagent: SubagentRecord }
}

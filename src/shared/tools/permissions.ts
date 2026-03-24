import type { SubagentRole } from './subagent/index.d'
import { embeddedToolMetadata } from './metadata'

export interface AgentToolAccessProfile {
  kind: 'main' | 'subagent'
  role?: SubagentRole
}

export function resolveAllowedEmbeddedToolsForAgent(
  profile: AgentToolAccessProfile
): string[] | undefined {
  if (profile.kind === 'main') {
    return undefined
  }

  return Object.entries(embeddedToolMetadata)
    .filter(([, metadata]) => {
      if (metadata.subagent !== 'allow') {
        return false
      }
      if (!metadata.roles?.length) {
        return true
      }
      if (!profile.role) {
        return false
      }
      return metadata.roles.includes(profile.role)
    })
    .map(([toolName]) => toolName)
    .sort()
}

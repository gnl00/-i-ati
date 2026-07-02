import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const visionAgentToolMetadata = {
  vision_agent_analyze: {
    capability: 'vision',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  }
} satisfies EmbeddedToolMetadataMap

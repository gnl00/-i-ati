import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const visionToolMetadata = {
  vision_analyze: {
    capability: 'vision',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  }
} satisfies EmbeddedToolMetadataMap

import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const visionToolMetadata = {
  image_analyze: {
    requires: ['visionAnalysisAvailable'],
    capability: 'vision',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  }
} satisfies EmbeddedToolMetadataMap

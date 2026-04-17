import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const emotionToolMetadata = {
  emotion_report: {
    capability: 'emotion',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  }
} satisfies EmbeddedToolMetadataMap

import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const emotionToolMetadata = {
  emotion_report: {
    needChatUUID: false,
    capability: 'emotion',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  }
} satisfies EmbeddedToolMetadataMap

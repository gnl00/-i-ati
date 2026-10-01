import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const imageToolMetadata = {
  image_show: {
    needChatUUID: false,
    capability: 'filesystem_read',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny',
  },
} satisfies EmbeddedToolMetadataMap

import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const imageToolMetadata = {
  image_generate: {
    needChatUUID: false,
    capability: 'vision',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny',
  },
  image_show: {
    needChatUUID: false,
    capability: 'filesystem_read',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny',
  },
} satisfies EmbeddedToolMetadataMap

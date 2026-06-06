import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const titleToolMetadata = {
  chat_set_title: {
    capability: 'chat',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  }
} satisfies EmbeddedToolMetadataMap

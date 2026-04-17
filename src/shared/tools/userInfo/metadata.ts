import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const userInfoToolMetadata = {
  user_info_get: {
    capability: 'user_info',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  user_info_set: {
    capability: 'user_info',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  }
} satisfies EmbeddedToolMetadataMap

import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const telegramToolMetadata = {
  telegram_setup_tool: {
    capability: 'telegram',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  telegram_search_targets: {
    capability: 'telegram',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  telegram_send_message: {
    capability: 'telegram',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  }
} satisfies EmbeddedToolMetadataMap

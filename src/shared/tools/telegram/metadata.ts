import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const telegramToolMetadata = {
  telegram_setup_tool: {
    capability: 'telegram',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  }
} satisfies EmbeddedToolMetadataMap

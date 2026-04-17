import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const pluginToolMetadata = {
  list_plugins: {
    capability: 'plugin',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  plugin_install: {
    capability: 'plugin',
    riskLevel: 'dangerous',
    mutatesWorkspace: true,
    subagent: 'deny'
  },
  plugin_uninstall: {
    capability: 'plugin',
    riskLevel: 'dangerous',
    mutatesWorkspace: true,
    subagent: 'deny'
  }
} satisfies EmbeddedToolMetadataMap

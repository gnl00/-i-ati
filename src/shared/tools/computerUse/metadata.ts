import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const computerUseToolMetadata = {
  computer_use: {
    capability: 'computer_use',
    riskLevel: 'dangerous',
    mutatesWorkspace: false,
    subagent: 'deny',
    actionOverrides: {
      status: { riskLevel: 'none' },
      request_permissions: { riskLevel: 'warning' },
      apps: { riskLevel: 'none' },
      running_apps: { riskLevel: 'none' },
      open_app: { riskLevel: 'warning' },
      windows: { riskLevel: 'none' },
      state: { riskLevel: 'warning' },
      click_element: { riskLevel: 'dangerous' },
      click_coordinate: { riskLevel: 'dangerous' },
      type_text: { riskLevel: 'dangerous' },
      set_value: { riskLevel: 'dangerous' },
      press_key: { riskLevel: 'dangerous' },
      scroll: { riskLevel: 'dangerous' },
      drag: { riskLevel: 'dangerous' },
      finish: { riskLevel: 'none' }
    }
  }
} satisfies EmbeddedToolMetadataMap

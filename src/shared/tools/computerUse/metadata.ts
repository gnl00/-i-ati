import type { EmbeddedToolMetadataMap } from '../metadata-types'

export const computerUseToolMetadata = {
  computer_use_status: {
    capability: 'computer_use',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  computer_use_request_permissions: {
    capability: 'computer_use',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  computer_use_apps: {
    capability: 'computer_use',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  computer_use_running_apps: {
    capability: 'computer_use',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  computer_use_open_app: {
    capability: 'computer_use',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  computer_use_windows: {
    capability: 'computer_use',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  computer_use_state: {
    capability: 'computer_use',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  computer_use_click_element: {
    capability: 'computer_use',
    riskLevel: 'dangerous',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  computer_use_click_coordinate: {
    capability: 'computer_use',
    riskLevel: 'dangerous',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  computer_use_type_text: {
    capability: 'computer_use',
    riskLevel: 'dangerous',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  computer_use_set_value: {
    capability: 'computer_use',
    riskLevel: 'dangerous',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  computer_use_press_key: {
    capability: 'computer_use',
    riskLevel: 'dangerous',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  computer_use_scroll: {
    capability: 'computer_use',
    riskLevel: 'dangerous',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  computer_use_drag: {
    capability: 'computer_use',
    riskLevel: 'dangerous',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  computer_use_finish: {
    capability: 'computer_use',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  }
} satisfies EmbeddedToolMetadataMap

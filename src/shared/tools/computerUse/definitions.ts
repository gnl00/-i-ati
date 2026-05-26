import type { ToolDefinition } from '@shared/tools/registry'

const snapshotId = {
  type: 'string',
  description: 'Snapshot id returned by computer_use_state. Keep one action sequence tied to the same helper session.'
}

const includeScreenshotAfter = {
  type: 'boolean',
  description: 'If true, request a post-action screenshot from the native backend.'
}

export const computerUseTools = [
  {
    type: 'function',
    function: {
      name: 'computer_use_status',
      description: 'Check native computer-use backend availability, helper identity, code signing status, and macOS permissions without triggering permission prompts.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'computer_use_request_permissions',
      description: 'Ask macOS to show native computer-use permission prompts for Accessibility and Screen Recording, then return the resulting permission state.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'computer_use_apps',
      description: 'List installed and running macOS GUI apps available to the native computer-use backend.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'computer_use_running_apps',
      description: 'List currently running macOS GUI apps visible to the native computer-use backend.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'computer_use_open_app',
      description: 'Open a macOS app by bundle id, exact name, partial name, or .app path through the native computer-use backend.',
      parameters: {
        type: 'object',
        properties: {
          app: {
            type: 'string',
            description: 'App name, bundle id, partial name, or .app path.'
          }
        },
        required: ['app'],
        additionalProperties: false,
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'computer_use_windows',
      description: 'List readable windows for a running macOS app through the native computer-use backend.',
      parameters: {
        type: 'object',
        properties: {
          app: {
            type: 'string',
            description: 'App name or bundle id.'
          }
        },
        required: ['app'],
        additionalProperties: false,
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'computer_use_state',
      description: 'Capture a structured macOS app/window accessibility snapshot. Use this before native GUI actions.',
      parameters: {
        type: 'object',
        properties: {
          app: {
            type: 'string',
            description: 'App name or bundle id.'
          },
          windowTitle: {
            type: 'string',
            description: 'Optional window title filter.'
          },
          windowId: {
            type: 'number',
            description: 'Optional native window id.'
          },
          includeScreenshot: {
            type: 'boolean',
            description: 'If true, include screenshot metadata or path. Coordinate actions require a screenshot-backed snapshot.'
          }
        },
        required: ['app'],
        additionalProperties: false,
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'computer_use_click_element',
      description: 'Click an accessibility element from the latest native app snapshot by element index.',
      parameters: {
        type: 'object',
        properties: {
          snapshotId,
          elementIndex: {
            type: 'number',
            description: 'Element index returned by computer_use_state.'
          },
          includeScreenshotAfter
        },
        required: ['snapshotId', 'elementIndex'],
        additionalProperties: false,
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'computer_use_click_coordinate',
      description: 'Click a screenshot pixel coordinate from the latest screenshot-backed native app snapshot.',
      parameters: {
        type: 'object',
        properties: {
          snapshotId,
          x: {
            type: 'number',
            description: 'Screenshot x coordinate in pixels.'
          },
          y: {
            type: 'number',
            description: 'Screenshot y coordinate in pixels.'
          },
          includeScreenshotAfter
        },
        required: ['snapshotId', 'x', 'y'],
        additionalProperties: false,
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'computer_use_type_text',
      description: 'Type text into an explicit editable element or the focused editable element in the latest native app snapshot.',
      parameters: {
        type: 'object',
        properties: {
          snapshotId,
          text: {
            type: 'string',
            description: 'Text to type.'
          },
          elementIndex: {
            type: 'number',
            description: 'Optional editable element index returned by computer_use_state.'
          },
          includeScreenshotAfter
        },
        required: ['snapshotId', 'text'],
        additionalProperties: false,
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'computer_use_set_value',
      description: 'Set AXValue on a value-settable element in the latest native app snapshot.',
      parameters: {
        type: 'object',
        properties: {
          snapshotId,
          elementIndex: {
            type: 'number',
            description: 'Value-settable element index returned by computer_use_state.'
          },
          value: {
            type: 'string',
            description: 'Value to set.'
          },
          includeScreenshotAfter
        },
        required: ['snapshotId', 'elementIndex', 'value'],
        additionalProperties: false,
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'computer_use_press_key',
      description: 'Send a key or key combination to the target app from the latest native app snapshot.',
      parameters: {
        type: 'object',
        properties: {
          snapshotId,
          key: {
            type: 'string',
            description: 'Key or key combination accepted by the native backend, for example Enter, Escape, Command+L.'
          },
          includeScreenshotAfter
        },
        required: ['snapshotId', 'key'],
        additionalProperties: false,
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'computer_use_scroll',
      description: 'Scroll from an element in the latest native app snapshot.',
      parameters: {
        type: 'object',
        properties: {
          snapshotId,
          elementIndex: {
            type: 'number',
            description: 'Scrollable element index returned by computer_use_state.'
          },
          direction: {
            type: 'string',
            enum: ['up', 'down', 'left', 'right'],
            description: 'Scroll direction.'
          },
          pages: {
            type: 'number',
            description: 'Number of pages to scroll. Defaults to 1.'
          },
          includeScreenshotAfter
        },
        required: ['snapshotId', 'elementIndex', 'direction'],
        additionalProperties: false,
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'computer_use_drag',
      description: 'Drag between two screenshot pixel coordinates from the latest screenshot-backed native app snapshot.',
      parameters: {
        type: 'object',
        properties: {
          snapshotId,
          fromX: {
            type: 'number',
            description: 'Start screenshot x coordinate in pixels.'
          },
          fromY: {
            type: 'number',
            description: 'Start screenshot y coordinate in pixels.'
          },
          toX: {
            type: 'number',
            description: 'End screenshot x coordinate in pixels.'
          },
          toY: {
            type: 'number',
            description: 'End screenshot y coordinate in pixels.'
          },
          includeScreenshotAfter
        },
        required: ['snapshotId', 'fromX', 'fromY', 'toX', 'toY'],
        additionalProperties: false,
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'computer_use_finish',
      description: 'Finish the current native computer-use session and release background activation state.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  }
] satisfies ToolDefinition[]

export default computerUseTools

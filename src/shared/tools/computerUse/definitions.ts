import type { ToolDefinition } from '@shared/tools/registry'
import { computerUseActions } from './actions'

export const computerUseTools = [
  {
    type: 'function',
    function: {
      name: 'computer_use',
      description: [
        'Control macOS apps through the native backend with a required action and flat fields.',
        'status checks availability, signing and permissions; request_permissions triggers macOS Accessibility and Screen Recording prompts.',
        'apps lists installed/running apps; running_apps lists running apps; open_app opens an app; windows lists its windows.',
        'state captures accessibility nodes and an optional screenshot. Capture state before GUI actions.',
        'click_element clicks an AX element; click_coordinate clicks screenshot pixels; type_text types into an explicit or focused editable element;',
        'set_value sets AXValue; press_key sends a key combination; scroll scrolls an element; drag moves between screenshot pixels.',
        'Coordinate clicks and drags require a screenshot-backed snapshot. Keep each action sequence in the same helper session.',
        'finish releases the session and background activation state.',
        ...Object.entries(computerUseActions).map(
          ([action, fields]) =>
            `${action}: required [${fields.required.join(', ')}]; optional [${fields.optional.join(', ')}].`
        )
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: Object.keys(computerUseActions),
            description: 'Operation to perform.'
          },
          app: {
            type: 'string',
            description:
              'App name or bundle id. open_app also accepts a partial name or .app path. Required for open_app, windows, state.'
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
            description:
              'If true, include screenshot metadata or path. Coordinate actions require a screenshot-backed snapshot.'
          },
          snapshotId: {
            type: 'string',
            description:
              'Snapshot id returned by computer_use(action=state). Keep one action sequence tied to the same helper session.'
          },
          elementIndex: {
            type: 'number',
            description:
              'Element index returned by state; required for click_element, set_value, scroll; optional for type_text.'
          },
          includeScreenshotAfter: {
            type: 'boolean',
            description:
              'If true, request a post-action screenshot from the native backend.'
          },
          x: {
            type: 'number',
            description: 'Screenshot x coordinate in pixels.'
          },
          y: {
            type: 'number',
            description: 'Screenshot y coordinate in pixels.'
          },
          text: { type: 'string', description: 'Text to type.' },
          value: { type: 'string', description: 'Value to set.' },
          key: {
            type: 'string',
            description:
              'Key or key combination accepted by the native backend, for example Enter, Escape, Command+L.'
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
          }
        },
        required: ['action'],
        additionalProperties: false,
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  }
] satisfies ToolDefinition[]

export default computerUseTools

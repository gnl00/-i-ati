import type { ToolDefinition } from '@shared/tools/registry'
import { computerUseActions } from './actions'

export const computerUseTools = [
  {
    type: 'function',
    function: {
      name: 'computer_use',
      description: [
        'Control macOS apps with flat action fields.',
        'status checks availability/signing/permissions; request_permissions prompts for Accessibility/Screen Recording.',
        'apps lists installed/running apps; running_apps lists running apps; open_app opens one; windows lists its windows.',
        'Capture state (AX nodes/optional screenshot) before GUI actions; keep the sequence in one helper session.',
        'click_element uses AX; click_coordinate/drag use screenshot pixels and require a screenshot-backed snapshot.',
        'type_text uses an explicit/focused editable element; set_value sets AXValue; press_key sends keys; scroll moves an element.',
        'finish releases session/background activation.',
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
            description: 'Native operation.'
          },
          app: {
            type: 'string',
            description:
              'Name/bundle ID; required for open_app/windows/state. open_app also accepts partial names/.app paths.'
          },
          windowTitle: {
            type: 'string',
            description: 'Window title filter.'
          },
          windowId: {
            type: 'number',
            description: 'Native window ID.'
          },
          includeScreenshot: {
            type: 'boolean',
            description:
              'Include screenshot metadata/path.'
          },
          snapshotId: {
            type: 'string',
            description:
              'Snapshot ID from state, in the same helper session.'
          },
          elementIndex: {
            type: 'number',
            description:
              'Index from state; required for click_element/set_value/scroll, optional for type_text.'
          },
          includeScreenshotAfter: {
            type: 'boolean',
            description:
              'Request a post-action screenshot.'
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
              'Native key/combination, e.g. Enter, Escape, Command+L.'
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

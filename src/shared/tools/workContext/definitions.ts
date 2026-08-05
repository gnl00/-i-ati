import type { ToolDefinition } from '@shared/tools/registry'

export const sessionContextTools = [
  {
    type: 'function',
    function: {
      name: 'session_context',
      description: 'Manage the current chat session work context. Use action get to read the current context or set to replace it with new Markdown content.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['get', 'set'],
            description: 'Session context operation to perform: get reads the current work context, set replaces it with new Markdown content.'
          },
          content: {
            type: 'string',
            description: 'Complete markdown content to store as the current session work context. Only used for action set.'
          }
        },
        required: ['action'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  }
] satisfies ToolDefinition[]

export default sessionContextTools

import type { ToolDefinition } from '@shared/tools/registry'

export const sessionContextTools = [
  {
    type: 'function',
    function: {
      name: 'session_context',
      description: 'Read or replace the current chat\'s work context.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['get', 'set'],
            description: 'get reads; set replaces the full Markdown context.'
          },
          content: {
            type: 'string',
            description: 'Complete Markdown for set.'
          }
        },
        required: ['action'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  }
] satisfies ToolDefinition[]

export default sessionContextTools
